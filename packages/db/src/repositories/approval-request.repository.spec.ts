import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  applications,
  approvalDecisions,
  approvalRequests,
  conversations,
  executions,
  externalSubjectApplications,
  externalSubjects,
  members,
  organizations,
  users,
} from "../schema/index.js"
import {
  claimAndDecideTimedOutApprovalRequest,
  createApprovalRequest,
  decideWorkspaceApprovalRequest,
  getApprovalDecision,
  getApprovalRequest,
  findExternalApprovalRequests,
  listPendingApprovalRequests,
} from "./approval-request.repository.js"
import { createExecution } from "./execution.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function addMember(tx: Transaction, workspaceId: string, email: string) {
  const [user] = await tx
    .insert(users)
    .values({ name: "Reviewer", email })
    .returning()
  await tx.insert(members).values({
    organizationId: workspaceId,
    userId: user.id,
    role: "member",
    createdAt: new Date(),
  })
  return user
}

async function createWorkspaceExecution(tx: Transaction) {
  const fixtures = await createTestFixtures(tx)
  const execution = await createExecution(tx, {
    workspaceId: fixtures.organization.id,
    workflowId: fixtures.workflow.id,
    workflowVersionId: fixtures.version.id,
    trigger: "manual",
  })
  return { ...fixtures, execution }
}

async function createExternalExecution(tx: Transaction) {
  const fixtures = await createTestFixtures(tx)
  const [application] = await tx
    .insert(applications)
    .values({
      workspaceId: fixtures.organization.id,
      environment: "production",
      displayName: "Customer portal",
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: "portal",
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  const [subject] = await tx
    .insert(externalSubjects)
    .values({
      workspaceId: fixtures.organization.id,
      issuer: application.oidcIssuer,
      issuerSubject: "subject-" + randomUUID(),
      status: "verified",
      verifiedAt: new Date(),
    })
    .returning()
  await tx.insert(externalSubjectApplications).values({
    workspaceId: fixtures.organization.id,
    applicationId: application.id,
    externalSubjectId: subject.id,
  })
  const [conversation] = await tx
    .insert(conversations)
    .values({
      workspaceId: fixtures.organization.id,
      applicationId: application.id,
      workflowId: fixtures.workflow.id,
      externalSubjectId: subject.id,
      environment: "production",
    })
    .returning()
  const [execution] = await tx
    .insert(executions)
    .values({
      workspaceId: fixtures.organization.id,
      workflowId: fixtures.workflow.id,
      workflowVersionId: fixtures.version.id,
      applicationId: application.id,
      externalSubjectRecordId: subject.id,
      conversationId: conversation.id,
      trigger: "api",
      environment: "production",
    })
    .returning()
  return { ...fixtures, application, subject, conversation, execution }
}

describe("Approval Request repository", () => {
  it("snapshots a workspace request and preserves member eligibility", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, execution } =
        await createWorkspaceExecution(tx)
      const reviewer = await addMember(tx, organization.id, "Reviewer@Test.dev")
      const request = await createApprovalRequest(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "approval-1",
        audience: "workspace",
        display: {
          title: "Send refund?",
          description: "Refund $49.00",
          details: { amount: "$49.00" },
        },
        approverEmails: ["Reviewer@Test.dev"],
      })
      expect(request).toMatchObject({
        status: "pending",
        version: 1,
        approverEmails: ["reviewer@test.dev"],
      })
      expect(
        await listPendingApprovalRequests(tx, organization.id, reviewer.email)
      ).toHaveLength(1)
      expect(
        await listPendingApprovalRequests(
          tx,
          organization.id,
          "someone-else@test.dev"
        )
      ).toEqual([])
    })
  })

  it("is idempotent for one Approval node visit", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, execution } =
        await createWorkspaceExecution(tx)
      const input = {
        workspaceId: organization.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "approval-1",
        audience: "workspace" as const,
        display: { title: "Original snapshot" },
      }
      const first = await createApprovalRequest(tx, input)
      const repeated = await createApprovalRequest(tx, {
        ...input,
        display: { title: "Changed configuration" },
      })
      expect(first?.display).toEqual({ title: "Original snapshot" })
      expect(repeated).toBeUndefined()
    })
  })

  it("owns an external request by a verified subject and Conversation", async () => {
    await withRollback(async (tx) => {
      const fixtures = await createExternalExecution(tx)
      const request = await createApprovalRequest(tx, {
        workspaceId: fixtures.organization.id,
        applicationId: fixtures.application.id,
        workflowId: fixtures.workflow.id,
        executionId: fixtures.execution.id,
        nodeId: "approval-1",
        audience: "external_subject",
        externalSubjectId: fixtures.subject.id,
        conversationId: fixtures.conversation.id,
        display: { title: "Send refund?" },
      })
      expect(request).toMatchObject({
        applicationId: fixtures.application.id,
        externalSubjectId: fixtures.subject.id,
        conversationId: fixtures.conversation.id,
      })
    })
  })

  it("lists only pending requests owned by the external subject", async () => {
    await withRollback(async (tx) => {
      const fixture = await createExternalExecution(tx)
      const request = await createApprovalRequest(tx, {
        workspaceId: fixture.organization.id,
        applicationId: fixture.application.id,
        workflowId: fixture.workflow.id,
        executionId: fixture.execution.id,
        nodeId: "approval-1",
        audience: "external_subject",
        externalSubjectId: fixture.subject.id,
        conversationId: fixture.conversation.id,
        display: { title: "Send refund?" },
      })
      if (!request) throw new Error("Approval Request was not created")
      const input = {
        workspaceId: fixture.organization.id,
        applicationId: fixture.application.id,
        externalSubjectId: fixture.subject.id,
      }
      await expect(
        findExternalApprovalRequests(tx, {
          ...input,
          conversationId: fixture.conversation.id,
          limit: 20,
          status: "pending",
        })
      ).resolves.toMatchObject([{ request: { id: request.id } }])
      await expect(
        findExternalApprovalRequests(tx, {
          ...input,
          conversationId: randomUUID(),
          limit: 20,
          status: "pending",
        })
      ).resolves.toEqual([])
      await expect(
        findExternalApprovalRequests(tx, {
          ...input,
          approvalRequestId: request.id,
          limit: 1,
        })
      ).resolves.toMatchObject([
        { request: { id: request.id }, decision: null },
      ])
      await expect(
        findExternalApprovalRequests(tx, {
          ...input,
          externalSubjectId: randomUUID(),
          approvalRequestId: request.id,
          limit: 1,
        })
      ).resolves.toEqual([])
    })
  })

  it("does not skip requests that differ only below cursor precision", async () => {
    await withRollback(async (tx) => {
      const fixture = await createExternalExecution(tx)
      const newerId = "ffffffff-ffff-4fff-8fff-ffffffffffff"
      const olderId = "00000000-0000-4000-8000-000000000001"
      await tx.execute(sql`
        insert into ${approvalRequests} (
          id, workspace_id, application_id, workflow_id, execution_id,
          node_id, audience, external_subject_id, conversation_id, display,
          requested_at
        ) values
          (
            ${newerId}::uuid, ${fixture.organization.id}::uuid,
            ${fixture.application.id}::uuid, ${fixture.workflow.id}::uuid,
            ${fixture.execution.id}::uuid, 'approval-newer',
            'external_subject', ${fixture.subject.id}::uuid,
            ${fixture.conversation.id}::uuid, '{"title":"newer"}'::jsonb,
            '2026-09-16 00:00:00.123900+00'::timestamptz
          ),
          (
            ${olderId}::uuid, ${fixture.organization.id}::uuid,
            ${fixture.application.id}::uuid, ${fixture.workflow.id}::uuid,
            ${fixture.execution.id}::uuid, 'approval-older',
            'external_subject', ${fixture.subject.id}::uuid,
            ${fixture.conversation.id}::uuid, '{"title":"older"}'::jsonb,
            '2026-09-16 00:00:00.123100+00'::timestamptz
          )
      `)
      const first = await findExternalApprovalRequests(tx, {
        workspaceId: fixture.organization.id,
        applicationId: fixture.application.id,
        externalSubjectId: fixture.subject.id,
        status: "pending",
        limit: 1,
      })
      if (!first[0]) throw new Error("First Approval Request page is empty")
      const second = await findExternalApprovalRequests(tx, {
        workspaceId: fixture.organization.id,
        applicationId: fixture.application.id,
        externalSubjectId: fixture.subject.id,
        status: "pending",
        limit: 1,
        cursor: {
          requestedAt: first[0].request.requestedAt,
          id: first[0].request.id,
        },
      })
      if (!second[0]) throw new Error("Second Approval Request page is empty")
      expect(first[0].request.id).toBe(newerId)
      expect(second[0].request.id).toBe(olderId)
    })
  })

  it("rejects an unverified external owner", async () => {
    await withRollback(async (tx) => {
      const fixtures = await createExternalExecution(tx)
      await tx
        .update(externalSubjects)
        .set({ status: "provisioned", verifiedAt: null })
        .where(eq(externalSubjects.id, fixtures.subject.id))
      await expect(
        createApprovalRequest(tx, {
          workspaceId: fixtures.organization.id,
          applicationId: fixtures.application.id,
          workflowId: fixtures.workflow.id,
          executionId: fixtures.execution.id,
          nodeId: "approval-1",
          audience: "external_subject",
          externalSubjectId: fixtures.subject.id,
          conversationId: fixtures.conversation.id,
          display: { title: "Send refund?" },
        })
      ).rejects.toThrow(/verified owner/)
    })
  })

  it("rejects a mismatched external owner at the database boundary", async () => {
    await withRollback(async (tx) => {
      const fixtures = await createExternalExecution(tx)
      const [otherSubject] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: fixtures.organization.id,
          issuer: fixtures.application.oidcIssuer,
          issuerSubject: "other-" + randomUUID(),
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      await tx.insert(externalSubjectApplications).values({
        workspaceId: fixtures.organization.id,
        applicationId: fixtures.application.id,
        externalSubjectId: otherSubject.id,
      })
      await expect(
        tx.insert(approvalRequests).values({
          workspaceId: fixtures.organization.id,
          applicationId: fixtures.application.id,
          workflowId: fixtures.workflow.id,
          executionId: fixtures.execution.id,
          nodeId: "approval-1",
          audience: "external_subject",
          externalSubjectId: otherSubject.id,
          conversationId: fixtures.conversation.id,
          display: { title: "Mismatched owner" },
        })
      ).rejects.toThrow()
    })
  })

  it("stores one immutable workspace Decision and queues the Execution", async () => {
    const { organization, workflow, version } = await db.transaction((tx) =>
      createTestFixtures(tx)
    )
    try {
      const execution = await createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const reviewer = await db.transaction((tx) =>
        addMember(tx, organization.id, "reviewer-" + randomUUID() + "@test.dev")
      )
      await db
        .update(executions)
        .set({ status: "paused" })
        .where(eq(executions.id, execution.id))
      const request = await createApprovalRequest(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "approval-1",
        audience: "workspace",
        display: { title: "Deploy?" },
      })
      if (!request) throw new Error("Expected an Approval Request")
      const result = await decideWorkspaceApprovalRequest(
        db,
        organization.id,
        request.id,
        {
          outcome: "approved",
          actorUserId: reviewer.id,
          actorEmail: reviewer.email,
          comment: "Ship it",
        }
      )
      expect(result?.request).toMatchObject({ status: "decided", version: 2 })
      expect(result?.decision).toMatchObject({
        outcome: "approved",
        actorKind: "workspace_member",
        actorUserId: reviewer.id,
        reason: "human",
        comment: "Ship it",
      })
      await expect(
        pool.query(
          "UPDATE approval_decisions SET comment = 'changed' WHERE approval_request_id = $1",
          [request.id]
        )
      ).rejects.toThrow(/immutable/i)
      await expect(
        pool.query(
          "DELETE FROM approval_decisions WHERE approval_request_id = $1",
          [request.id]
        )
      ).rejects.toThrow(/immutable/i)
      expect(await getApprovalDecision(db, request.id)).toMatchObject({
        comment: "Ship it",
      })
      await expect(
        pool.query("UPDATE approval_requests SET display = $1 WHERE id = $2", [
          { title: "Changed" },
          request.id,
        ])
      ).rejects.toThrow(/immutable/i)
      const [reloadedExecution] = await db
        .select()
        .from(executions)
        .where(eq(executions.id, execution.id))
      expect(reloadedExecution.status).toBe("queued")
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, organization.id))
    }
  })

  it("creates a timeout Decision instead of a timeout outcome", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, execution } =
        await createWorkspaceExecution(tx)
      const requestedAt = new Date("2026-01-01T00:00:00.000Z")
      const request = await createApprovalRequest(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "approval-1",
        audience: "workspace",
        display: { title: "Deploy?" },
        requestedAt,
        expiresAt: new Date("2026-01-01T00:01:00.000Z"),
        timeoutAction: "auto_reject",
      })
      const result = await claimAndDecideTimedOutApprovalRequest(
        tx,
        new Date("2026-01-01T00:02:00.000Z")
      )
      expect(result.outcome).toBe("decided")
      if (result.outcome !== "decided") return
      expect(result.request).toMatchObject({ id: request?.id, version: 2 })
      expect(result.decision).toMatchObject({
        outcome: "rejected",
        actorKind: "system",
        reason: "timeout",
      })
    })
  })

  it("enforces bounded display and comment snapshots", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, execution } =
        await createWorkspaceExecution(tx)
      await expect(
        tx.transaction((constraintTx) =>
          constraintTx.insert(approvalRequests).values({
            workspaceId: organization.id,
            workflowId: workflow.id,
            executionId: execution.id,
            nodeId: "approval-1",
            audience: "workspace",
            display: { title: "x".repeat(8_193) },
          })
        )
      ).rejects.toThrow()
      const request = await createApprovalRequest(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "approval-2",
        audience: "workspace",
        display: { title: "Deploy?" },
      })
      if (!request) throw new Error("Expected an Approval Request")
      await expect(
        tx.transaction((constraintTx) =>
          constraintTx.insert(approvalDecisions).values({
            workspaceId: organization.id,
            approvalRequestId: request.id,
            outcome: "approved",
            actorKind: "system",
            reason: "timeout",
            comment: "x".repeat(2_049),
          })
        )
      ).rejects.toThrow()
      expect(
        await getApprovalRequest(
          tx,
          organization.id,
          execution.id,
          "approval-2"
        )
      ).toMatchObject({ display: { title: "Deploy?" } })
    })
  })
})
