import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  applications,
  applicationKeys,
  auditLogs,
  externalSubjectApplications,
  externalSubjects,
  workflows,
} from "../schema/index.js"
import { putApplicationWorkflowBinding } from "./application-workflow-binding.repository.js"
import { hashPublicRequest } from "./public-idempotency.repository.js"
import {
  cancelPublicExecution,
  createPublicConversation,
  createPublicMessage,
  getPublicConversation,
  getPublicExecution,
  listPublicMessages,
  startPublicExecution,
} from "./public-runtime.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"
import { createWorkflowContractRevision } from "./workflow-contract.repository.js"
import {
  createWorkflowVersion,
  publishWorkflowVersion,
} from "./workflow.repository.js"

async function createRuntimeFixture(tx: Transaction) {
  const { organization, workflow } = await createTestFixtures(tx)
  const [application] = await tx
    .insert(applications)
    .values({
      workspaceId: organization.id,
      environment: "production",
      displayName: "Customer portal",
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: "customer-portal",
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  const [applicationKey] = await tx
    .insert(applicationKeys)
    .values({
      workspaceId: organization.id,
      applicationId: application.id,
      name: "Runtime key",
      scopes: ["executions:cancel"],
      hashedKey: randomUUID(),
      keyPrefix: "lin_app_test",
    })
    .returning()
  const contract = await createWorkflowContractRevision(
    tx,
    organization.id,
    workflow.id,
    {
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
      outputSchema: { type: "object" },
    }
  )
  if (contract.outcome !== "created") throw new Error("Contract not created")
  const version = await createWorkflowVersion(tx, {
    workflowId: workflow.id,
    graph: {
      version: 1,
      trigger: { type: "api" },
      entryNodeId: "start",
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "end", type: "end", config: {} },
      ],
      edges: [{ from: "start", to: "end" }],
    },
    contentHash: randomUUID(),
    workflowContractRevisionId: contract.revision.id,
  })
  await publishWorkflowVersion(tx, workflow.id, version.id)
  await putApplicationWorkflowBinding(
    tx,
    organization.id,
    application.id,
    workflow.id,
    {
      workflowContractRevisionId: contract.revision.id,
      allowBackendStart: true,
      allowEndUserStart: true,
      enabled: true,
    }
  )
  const [subject, otherSubject] = await tx
    .insert(externalSubjects)
    .values([
      {
        workspaceId: organization.id,
        issuer: application.oidcIssuer,
        issuerSubject: "customer-1",
        status: "verified",
        verifiedAt: new Date(),
      },
      {
        workspaceId: organization.id,
        issuer: application.oidcIssuer,
        issuerSubject: "customer-2",
        status: "verified",
        verifiedAt: new Date(),
      },
    ])
    .returning()
  await tx.insert(externalSubjectApplications).values([
    {
      workspaceId: organization.id,
      applicationId: application.id,
      externalSubjectId: subject.id,
    },
    {
      workspaceId: organization.id,
      applicationId: application.id,
      externalSubjectId: otherSubject.id,
    },
  ])
  return {
    workspaceId: organization.id,
    workflowId: workflow.id,
    applicationId: application.id,
    applicationKeyId: applicationKey.id,
    subjectId: subject.id,
    otherSubjectId: otherSubject.id,
    versionId: version.id,
  }
}

describe("public runtime repository", () => {
  it("creates isolated conversations and messages for one External Subject", async () => {
    await withRollback(async (tx) => {
      const fixture = await createRuntimeFixture(tx)
      const actorId = randomUUID()
      const conversationResult = await createPublicConversation(tx, {
        ...fixture,
        externalSubjectId: fixture.subjectId,
        startKind: "end_user",
        metadata: {},
        idempotency: {
          actor: { kind: "end_user_session", id: actorId },
          key: "conversation-1",
          requestHash: hashPublicRequest({ workflowId: fixture.workflowId }),
        },
      })
      expect(conversationResult.outcome).toBe("created")
      if (conversationResult.outcome !== "created") return
      const conversation = conversationResult.conversation
      expect(conversation.environment).toBe("production")
      expect(
        await getPublicConversation(
          tx,
          fixture.workspaceId,
          fixture.applicationId,
          fixture.otherSubjectId,
          conversation.id
        )
      ).toBeUndefined()
      const message = await createPublicMessage(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        conversationId: conversation.id,
        content: "hello",
        idempotency: {
          actor: { kind: "end_user_session", id: actorId },
          key: "message-1",
          requestHash: hashPublicRequest({ content: "hello" }),
        },
      })
      expect(message.outcome).toBe("created")
      const secondMessage = await createPublicMessage(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        conversationId: conversation.id,
        content: "second",
        idempotency: {
          actor: { kind: "end_user_session", id: actorId },
          key: "message-2",
          requestHash: hashPublicRequest({ content: "second" }),
        },
      })
      const thirdMessage = await createPublicMessage(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        conversationId: conversation.id,
        content: "third",
        idempotency: {
          actor: { kind: "end_user_session", id: actorId },
          key: "message-3",
          requestHash: hashPublicRequest({ content: "third" }),
        },
      })
      if (
        message.outcome !== "created" ||
        secondMessage.outcome !== "created" ||
        thirdMessage.outcome !== "created"
      ) {
        throw new Error("Messages not created")
      }
      const latestMessages = await listPublicMessages(
        tx,
        fixture.workspaceId,
        fixture.applicationId,
        fixture.subjectId,
        conversation.id,
        2,
        undefined
      )
      expect(latestMessages?.map(({ content }) => content)).toEqual([
        "third",
        "second",
      ])
      const olderMessages = await listPublicMessages(
        tx,
        fixture.workspaceId,
        fixture.applicationId,
        fixture.subjectId,
        conversation.id,
        2,
        secondMessage.message.sequence
      )
      expect(olderMessages?.map(({ content }) => content)).toEqual(["hello"])
      const otherMessages = await listPublicMessages(
        tx,
        fixture.workspaceId,
        fixture.applicationId,
        fixture.otherSubjectId,
        conversation.id,
        100,
        undefined
      )
      expect(otherMessages).toBeUndefined()
      const execution = await startPublicExecution(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        workflowId: fixture.workflowId,
        conversationId: conversation.id,
        startKind: "end_user",
        triggerPayload: { prompt: "hello" },
        idempotency: {
          actor: { kind: "end_user_session", id: actorId },
          key: "end-user-execution-1",
          requestHash: hashPublicRequest({ prompt: "hello" }),
        },
      })
      expect(execution.outcome).toBe("created")
      if (execution.outcome !== "created") return
      expect(execution.execution).toMatchObject({
        conversationId: conversation.id,
        externalSubjectRecordId: fixture.subjectId,
      })
    })
  })

  it("returns the original Execution for an identical retry and rejects changed input", async () => {
    await withRollback(async (tx) => {
      const fixture = await createRuntimeFixture(tx)
      const actor = { kind: "application_key" as const, id: randomUUID() }
      const base = {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        workflowId: fixture.workflowId,
        startKind: "backend" as const,
        triggerPayload: { prompt: "hello" },
        idempotency: {
          actor,
          key: "execution-1",
          requestHash: hashPublicRequest({ prompt: "hello" }),
        },
      }
      const created = await startPublicExecution(tx, base)
      const replay = await startPublicExecution(tx, base)
      const conflict = await startPublicExecution(tx, {
        ...base,
        triggerPayload: { prompt: "changed" },
        idempotency: {
          ...base.idempotency,
          requestHash: hashPublicRequest({ prompt: "changed" }),
        },
      })
      expect(created.outcome).toBe("created")
      expect(replay.outcome).toBe("replay")
      if (created.outcome !== "created" || replay.outcome !== "replay") return
      expect(replay.execution.id).toBe(created.execution.id)
      expect(created.execution).toMatchObject({
        externalSubjectRecordId: fixture.subjectId,
        externalSubjectId: "customer-1",
        environment: "production",
        workflowVersionId: fixture.versionId,
      })
      expect(conflict).toEqual({ outcome: "idempotency_conflict" })
    })
  })

  it("rejects a Conversation owned by another subject when starting", async () => {
    await withRollback(async (tx) => {
      const fixture = await createRuntimeFixture(tx)
      const conversation = await createPublicConversation(tx, {
        ...fixture,
        externalSubjectId: fixture.otherSubjectId,
        startKind: "end_user",
        metadata: {},
        idempotency: {
          actor: { kind: "end_user_session", id: randomUUID() },
          key: "other-conversation",
          requestHash: hashPublicRequest({ workflowId: fixture.workflowId }),
        },
      })
      if (conversation.outcome !== "created") {
        throw new Error("Conversation not created")
      }
      const resultActorId = randomUUID()
      const result = await startPublicExecution(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        workflowId: fixture.workflowId,
        conversationId: conversation.conversation.id,
        startKind: "end_user",
        triggerPayload: { prompt: "hello" },
        idempotency: {
          actor: { kind: "end_user_session", id: resultActorId },
          key: "cross-subject-start",
          requestHash: hashPublicRequest({ prompt: "hello" }),
        },
      })
      expect(result).toEqual({ outcome: "resource_not_found" })
      const repeated = await startPublicExecution(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        workflowId: fixture.workflowId,
        conversationId: conversation.conversation.id,
        startKind: "end_user",
        triggerPayload: { prompt: "hello" },
        idempotency: {
          actor: { kind: "end_user_session", id: resultActorId },
          key: "cross-subject-start",
          requestHash: hashPublicRequest({ prompt: "hello" }),
        },
      })
      expect(repeated).toEqual({ outcome: "resource_not_found" })
    })
  })

  it("rejects Contract-invalid input consistently across retries", async () => {
    await withRollback(async (tx) => {
      const fixture = await createRuntimeFixture(tx)
      const actorId = randomUUID()
      const input: Parameters<typeof startPublicExecution>[1] = {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        workflowId: fixture.workflowId,
        startKind: "end_user",
        triggerPayload: { unknown: true },
        idempotency: {
          actor: { kind: "end_user_session", id: actorId },
          key: "invalid-execution",
          requestHash: hashPublicRequest({ unknown: true }),
        },
      }
      expect(await startPublicExecution(tx, input)).toEqual({
        outcome: "validation_failed",
      })
      expect(await startPublicExecution(tx, input)).toEqual({
        outcome: "validation_failed",
      })
    })
  })

  it("rejects an archived Workflow even when its binding remains enabled", async () => {
    await withRollback(async (tx) => {
      const fixture = await createRuntimeFixture(tx)
      await tx
        .update(workflows)
        .set({ archivedAt: new Date() })
        .where(eq(workflows.id, fixture.workflowId))
      const result = await startPublicExecution(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        workflowId: fixture.workflowId,
        startKind: "backend",
        triggerPayload: { prompt: "hello" },
        idempotency: {
          actor: { kind: "application_key", id: randomUUID() },
          key: "archived-workflow",
          requestHash: hashPublicRequest({ prompt: "hello" }),
        },
      })
      expect(result).toEqual({ outcome: "workflow_start_not_allowed" })
    })
  })

  it("cancels only nonterminal Executions in the key's Application", async () => {
    await withRollback(async (tx) => {
      const fixture = await createRuntimeFixture(tx)
      const started = await startPublicExecution(tx, {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: fixture.subjectId,
        workflowId: fixture.workflowId,
        startKind: "backend",
        triggerPayload: { prompt: "hello" },
        idempotency: {
          actor: { kind: "application_key", id: randomUUID() },
          key: "cancel-me",
          requestHash: hashPublicRequest({ prompt: "hello" }),
        },
      })
      if (started.outcome !== "created")
        throw new Error("Execution not created")
      const cancelled = await cancelPublicExecution(
        tx,
        fixture.workspaceId,
        fixture.applicationId,
        started.execution.id,
        {
          actor: {
            kind: "application_key",
            id: fixture.applicationKeyId,
          },
          key: "cancel-execution",
          requestHash: hashPublicRequest({
            executionId: started.execution.id,
          }),
        }
      )
      const repeated = await cancelPublicExecution(
        tx,
        fixture.workspaceId,
        fixture.applicationId,
        started.execution.id,
        {
          actor: {
            kind: "application_key",
            id: fixture.applicationKeyId,
          },
          key: "cancel-execution",
          requestHash: hashPublicRequest({
            executionId: started.execution.id,
          }),
        }
      )
      expect(cancelled.outcome).toBe("cancelled")
      expect(repeated.outcome).toBe("cancelled")
      expect(
        await getPublicExecution(
          tx,
          fixture.workspaceId,
          fixture.applicationId,
          undefined,
          started.execution.id
        )
      ).toMatchObject({ status: "cancelled" })
      const audits = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, started.execution.id))
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        action: "execution.cancelled",
        actorApplicationKeyId: fixture.applicationKeyId,
      })
    })
  })
})
