import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  applications,
  applicationKeys,
  approvalDecisions,
  approvalRequests,
  auditLogs,
  conversations,
  endUserSessions,
  executions,
  externalSubjectApplications,
  externalSubjects,
} from "../schema/index.js"
import {
  claimAndDecideTimedOutApprovalRequest,
  createApprovalRequest,
  decideExternalApprovalRequest,
} from "./approval-request.repository.js"
import { startExecution } from "./execution.repository.js"
import { deleteExpiredEndUserSessions } from "./end-user-session.repository.js"
import { hashPublicRequest } from "./public-idempotency.repository.js"
import { cancelPublicExecution } from "./public-runtime.repository.js"
import { createTestFixtures } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function createRaceFixture(tx: Transaction) {
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
  const [applicationKey] = await tx
    .insert(applicationKeys)
    .values({
      workspaceId: fixtures.organization.id,
      applicationId: application.id,
      name: "Runtime key",
      scopes: ["executions:cancel"],
      hashedKey: randomUUID(),
      keyPrefix: "lin_app_test",
    })
    .returning()
  const [subject] = await tx
    .insert(externalSubjects)
    .values({
      workspaceId: fixtures.organization.id,
      issuer: application.oidcIssuer,
      issuerSubject: randomUUID(),
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
      status: "paused",
    })
    .returning()
  const sessions = await tx
    .insert(endUserSessions)
    .values(
      ["first", "replacement"].map((name) => ({
        workspaceId: fixtures.organization.id,
        applicationId: application.id,
        externalSubjectId: subject.id,
        tokenHash: `${name}-${randomUUID()}`,
        proofJkt: `${name}-${randomUUID()}`,
        nonceHash: `${name}-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
      }))
    )
    .returning()
  return {
    ...fixtures,
    application,
    applicationKey,
    subject,
    conversation,
    execution,
    sessions,
  }
}

async function createExternalRequest(
  fixture: Awaited<ReturnType<typeof createRaceFixture>>,
  options?: {
    expiresAt: Date
    timeoutAction: "auto_reject" | "auto_approve"
    actionIntentDigest?: string
  }
) {
  const request = await createApprovalRequest(db, {
    workspaceId: fixture.organization.id,
    applicationId: fixture.application.id,
    workflowId: fixture.workflow.id,
    executionId: fixture.execution.id,
    nodeId: "approval-1",
    audience: "external_subject",
    externalSubjectId: fixture.subject.id,
    conversationId: fixture.conversation.id,
    display: { title: "Send refund?" },
    ...options,
  })
  if (!request) throw new Error("Approval Request was not created")
  return request
}

function decisionInput(
  fixture: Awaited<ReturnType<typeof createRaceFixture>>,
  approvalRequestId: string,
  sessionIndex: number,
  idempotencyKey: string,
  outcome: "approved" | "rejected" = "approved"
) {
  return {
    workspaceId: fixture.organization.id,
    applicationId: fixture.application.id,
    externalSubjectId: fixture.subject.id,
    endUserSessionId: fixture.sessions[sessionIndex].id,
    approvalRequestId,
    outcome,
    comment: "Reviewed",
    idempotencyKey,
    now: new Date(),
  }
}

async function deleteRaceFixture(
  fixture: Awaited<ReturnType<typeof createRaceFixture>>
) {
  await pool.query("DELETE FROM approval_requests WHERE workspace_id = $1", [
    fixture.organization.id,
  ])
  await pool.query("DELETE FROM organizations WHERE id = $1", [
    fixture.organization.id,
  ])
}

async function releaseIntoRace<T>(
  approvalRequestId: string,
  run: () => Promise<T>
): Promise<T> {
  const lockClient = await pool.connect()
  try {
    await lockClient.query("BEGIN")
    await lockClient.query(
      "SELECT id FROM approval_requests WHERE id = $1 FOR UPDATE",
      [approvalRequestId]
    )
    const result = run()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await lockClient.query("COMMIT")
    return await result
  } finally {
    await lockClient.query("ROLLBACK")
    lockClient.release()
  }
}

describe("Approval Request terminal races", () => {
  it("rejects a Decision from a session that is no longer current", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const request = await createExternalRequest(fixture)
      await db
        .update(endUserSessions)
        .set({ revokedAt: new Date() })
        .where(eq(endUserSessions.id, fixture.sessions[0].id))
      const result = await decideExternalApprovalRequest(
        db,
        decisionInput(fixture, request.id, 0, "revoked-session")
      )
      expect(result).toEqual({ outcome: "session_invalid" })
      const [reloaded] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, request.id))
      expect(reloaded.status).toBe("pending")
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("returns an identical Decision across a replacement session and rejects conflicting reuse", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const request = await createExternalRequest(fixture)
      const first = await decideExternalApprovalRequest(
        db,
        decisionInput(fixture, request.id, 0, "decision-1")
      )
      const [otherExecution] = await db
        .insert(executions)
        .values({
          workspaceId: fixture.organization.id,
          workflowId: fixture.workflow.id,
          workflowVersionId: fixture.version.id,
          applicationId: fixture.application.id,
          externalSubjectRecordId: fixture.subject.id,
          conversationId: fixture.conversation.id,
          trigger: "api",
          environment: "production",
          status: "paused",
        })
        .returning()
      const otherRequest = await createApprovalRequest(db, {
        workspaceId: fixture.organization.id,
        applicationId: fixture.application.id,
        workflowId: fixture.workflow.id,
        executionId: otherExecution.id,
        nodeId: "approval-1",
        audience: "external_subject",
        externalSubjectId: fixture.subject.id,
        conversationId: fixture.conversation.id,
        display: { title: "Other request" },
      })
      if (!otherRequest) throw new Error("Approval Request was not created")
      const crossRequestConflict = await decideExternalApprovalRequest(
        db,
        decisionInput(fixture, otherRequest.id, 0, "decision-1")
      )
      await db
        .update(endUserSessions)
        .set({ revokedAt: new Date() })
        .where(eq(endUserSessions.id, fixture.sessions[0].id))
      const replay = await decideExternalApprovalRequest(
        db,
        decisionInput(fixture, request.id, 1, "decision-1")
      )
      const conflict = await decideExternalApprovalRequest(db, {
        ...decisionInput(fixture, request.id, 1, "decision-1", "rejected"),
        comment: "Changed",
      })
      expect(first.outcome).toBe("decided")
      expect(crossRequestConflict).toEqual({ outcome: "decision_conflict" })
      expect(replay.outcome).toBe("replay")
      expect(conflict).toEqual({ outcome: "decision_conflict" })
      if (first.outcome !== "decided" || replay.outcome !== "replay") return
      expect(replay.decision.id).toBe(first.decision.id)
      expect(replay.decision.endUserSessionId).toBe(fixture.sessions[0].id)
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, request.id))
      expect(audit).toMatchObject({
        action: "approval_request.decided",
        actorExternalSubjectId: fixture.subject.id,
        actorEndUserSessionId: fixture.sessions[0].id,
      })
      await db
        .update(endUserSessions)
        .set({ expiresAt: new Date(0) })
        .where(eq(endUserSessions.id, fixture.sessions[0].id))
      expect(await deleteExpiredEndUserSessions(db, new Date(1))).toBe(1)
      const [retainedDecision] = await db
        .select()
        .from(approvalDecisions)
        .where(eq(approvalDecisions.approvalRequestId, request.id))
      const [retainedAudit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, request.id))
      expect(retainedDecision.endUserSessionId).toBe(fixture.sessions[0].id)
      expect(retainedAudit.actorEndUserSessionId).toBe(fixture.sessions[0].id)
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("allows exactly one of two simultaneous human Decisions", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const request = await createExternalRequest(fixture)
      const results = await releaseIntoRace(request.id, () =>
        Promise.all([
          decideExternalApprovalRequest(
            db,
            decisionInput(fixture, request.id, 0, "approve", "approved")
          ),
          decideExternalApprovalRequest(
            db,
            decisionInput(fixture, request.id, 1, "reject", "rejected")
          ),
        ])
      )
      expect(results.map((result) => result.outcome).sort()).toEqual([
        "already_decided",
        "decided",
      ])
      const decisions = await db
        .select()
        .from(approvalDecisions)
        .where(eq(approvalDecisions.approvalRequestId, request.id))
      const audits = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, request.id))
      expect(decisions).toHaveLength(1)
      expect(audits).toHaveLength(1)
      const claims = await Promise.all([
        startExecution(
          db,
          fixture.execution.id,
          "resume-worker-a",
          new Date(Date.now() + 60_000)
        ),
        startExecution(
          db,
          fixture.execution.id,
          "resume-worker-b",
          new Date(Date.now() + 60_000)
        ),
      ])
      expect(claims.filter(Boolean)).toHaveLength(1)
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("records one timeout Decision when a human Decision races expiry", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const requestedAt = new Date("2026-01-01T00:00:00.000Z")
      const expiresAt = new Date("2026-01-01T00:01:00.000Z")
      const request = await createApprovalRequest(db, {
        workspaceId: fixture.organization.id,
        applicationId: fixture.application.id,
        workflowId: fixture.workflow.id,
        executionId: fixture.execution.id,
        nodeId: "approval-1",
        audience: "external_subject",
        externalSubjectId: fixture.subject.id,
        conversationId: fixture.conversation.id,
        display: { title: "Send refund?" },
        requestedAt,
        expiresAt,
        timeoutAction: "auto_reject",
      })
      if (!request) throw new Error("Approval Request was not created")
      const [human, timeout] = await releaseIntoRace(request.id, () =>
        Promise.all([
          decideExternalApprovalRequest(db, {
            ...decisionInput(fixture, request.id, 0, "late-decision"),
            now: new Date("2026-01-01T00:02:00.000Z"),
          }),
          claimAndDecideTimedOutApprovalRequest(
            db,
            new Date("2026-01-01T00:02:00.000Z")
          ),
        ])
      )
      expect(human.outcome).toBe("expired")
      expect(["decided", "empty"]).toContain(timeout.outcome)
      const decisions = await db
        .select()
        .from(approvalDecisions)
        .where(eq(approvalDecisions.approvalRequestId, request.id))
      expect(decisions).toMatchObject([
        { actorKind: "system", outcome: "rejected", reason: "timeout" },
      ])
      const audits = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, request.id))
      expect(audits).toMatchObject([{ action: "approval_request.timed_out" }])
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("never resumes a cancelled Execution when cancellation races a Decision", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const request = await createExternalRequest(fixture)
      const [decision, cancellation] = await releaseIntoRace(request.id, () =>
        Promise.all([
          decideExternalApprovalRequest(
            db,
            decisionInput(fixture, request.id, 0, "decision")
          ),
          cancelPublicExecution(
            db,
            fixture.organization.id,
            fixture.application.id,
            fixture.execution.id,
            {
              actor: {
                kind: "application_key",
                id: fixture.applicationKey.id,
              },
              key: "cancel",
              requestHash: hashPublicRequest({
                executionId: fixture.execution.id,
              }),
            }
          ),
        ])
      )
      expect(cancellation.outcome).toBe("cancelled")
      expect(["decided", "cancelled"]).toContain(decision.outcome)
      const [execution] = await db
        .select()
        .from(executions)
        .where(eq(executions.id, fixture.execution.id))
      const [reloadedRequest] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, request.id))
      expect(execution.status).toBe("cancelled")
      expect(reloadedRequest.status).toBe(
        decision.outcome === "decided" ? "decided" : "cancelled"
      )
      const audits = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, request.id))
      expect(audits).toHaveLength(1)
      expect(audits[0].action).toBe(
        decision.outcome === "decided"
          ? "approval_request.decided"
          : "approval_request.cancelled"
      )
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("cancels a workspace-audience request owned by a public Execution", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const request = await createApprovalRequest(db, {
        workspaceId: fixture.organization.id,
        applicationId: fixture.application.id,
        workflowId: fixture.workflow.id,
        executionId: fixture.execution.id,
        nodeId: "approval-1",
        audience: "workspace",
        display: { title: "Operator review" },
      })
      if (!request) throw new Error("Approval Request was not created")
      const result = await cancelPublicExecution(
        db,
        fixture.organization.id,
        fixture.application.id,
        fixture.execution.id,
        {
          actor: { kind: "application_key", id: fixture.applicationKey.id },
          key: "cancel-workspace-request",
          requestHash: hashPublicRequest({ executionId: fixture.execution.id }),
        }
      )
      expect(result.outcome).toBe("cancelled")
      const [reloaded] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, request.id))
      expect(reloaded).toMatchObject({ status: "cancelled", version: 2 })
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("returns cancelled for a Decision submitted after cancellation", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const request = await createExternalRequest(fixture)
      await cancelPublicExecution(
        db,
        fixture.organization.id,
        fixture.application.id,
        fixture.execution.id,
        {
          actor: { kind: "application_key", id: fixture.applicationKey.id },
          key: "cancel-before-decision",
          requestHash: hashPublicRequest({ executionId: fixture.execution.id }),
        }
      )
      const decision = await decideExternalApprovalRequest(
        db,
        decisionInput(fixture, request.id, 0, "late-decision")
      )
      expect(decision).toEqual({ outcome: "cancelled" })
      const decisions = await db
        .select()
        .from(approvalDecisions)
        .where(eq(approvalDecisions.approvalRequestId, request.id))
      expect(decisions).toEqual([])
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("rejects auto-approval for an Action Consent request", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      await expect(
        createExternalRequest(fixture, {
          expiresAt: new Date(Date.now() + 60_000),
          timeoutAction: "auto_approve",
          actionIntentDigest: "digest",
        })
      ).rejects.toThrow()
    } finally {
      await deleteRaceFixture(fixture)
    }
  })
})
