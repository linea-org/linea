import { and, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm"
import Ajv2020 from "ajv/dist/2020.js"
import {
  applications,
  applicationWorkflowBindings,
  auditLogs,
  chatMessages,
  conversations,
  executions,
  externalSubjectApplications,
  externalSubjects,
  workflows,
  workflowContractRevisions,
  workflowVersions,
  type ChatMessage,
  type Conversation,
  type Execution,
} from "../schema/index.js"
import { createChatMessage } from "./chat-message.repository.js"
import { createConversation } from "./conversation.repository.js"
import { cancelExecutionWithPendingApproval } from "./approval-request.repository.js"
import {
  finalizePublicRequest,
  releasePublicRequest,
  reservePublicRequest,
} from "./public-idempotency.repository.js"
import type { DbClient } from "./types.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"

const jsonSchemaValidator = new Ajv2020({ strict: true, addUsedSchema: false })

export type PublicRuntimeActor = {
  kind: "application_key" | "end_user_session"
  id: string
}

type Idempotency = {
  actor: PublicRuntimeActor
  key: string
  requestHash: string
}

async function resolveSubject(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string
) {
  const [identity] = await db
    .select({
      environment: applications.environment,
      enabled: applications.enabled,
      issuerSubject: externalSubjects.issuerSubject,
      subjectStatus: externalSubjects.status,
    })
    .from(applications)
    .innerJoin(
      externalSubjectApplications,
      and(
        eq(externalSubjectApplications.applicationId, applications.id),
        eq(externalSubjectApplications.workspaceId, applications.workspaceId),
        eq(externalSubjectApplications.externalSubjectId, externalSubjectId)
      )
    )
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, externalSubjectApplications.externalSubjectId),
        eq(
          externalSubjects.workspaceId,
          externalSubjectApplications.workspaceId
        )
      )
    )
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.workspaceId, workspaceId),
        eq(applications.kind, "operator")
      )
    )
  if (
    !identity?.enabled ||
    !identity.issuerSubject ||
    identity.subjectStatus === "disabled" ||
    identity.subjectStatus === "erased"
  ) {
    return undefined
  }
  return identity
}

async function bindingAllows(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  workflowId: string,
  startKind: "backend" | "end_user"
) {
  const [binding] = await db
    .select({
      workflowContractRevisionId:
        applicationWorkflowBindings.workflowContractRevisionId,
    })
    .from(applicationWorkflowBindings)
    .innerJoin(
      workflows,
      and(
        eq(workflows.id, applicationWorkflowBindings.workflowId),
        eq(workflows.workspaceId, applicationWorkflowBindings.workspaceId),
        isNotNull(workflows.publishedVersionId),
        isNull(workflows.archivedAt)
      )
    )
    .where(
      and(
        eq(applicationWorkflowBindings.workspaceId, workspaceId),
        eq(applicationWorkflowBindings.applicationId, applicationId),
        eq(applicationWorkflowBindings.workflowId, workflowId),
        eq(applicationWorkflowBindings.enabled, true),
        startKind === "backend"
          ? eq(applicationWorkflowBindings.allowBackendStart, true)
          : eq(applicationWorkflowBindings.allowEndUserStart, true)
      )
    )
  return binding
}

export type CreatePublicConversationResult =
  | { outcome: "created" | "replay"; conversation: Conversation }
  | { outcome: "resource_not_found" }
  | { outcome: "workflow_start_not_allowed" }
  | { outcome: "conversation_identity_conflict" }
  | { outcome: "idempotency_conflict" }

export async function createPublicConversation(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    workflowId: string
    startKind: "backend" | "end_user"
    externalThreadKey?: string
    title?: string
    metadata: Record<string, unknown>
    idempotency: Idempotency
  }
): Promise<CreatePublicConversationResult> {
  return db.transaction(async (tx): Promise<CreatePublicConversationResult> => {
    const reservation = await reservePublicRequest(tx, {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      actorKind: input.idempotency.actor.kind,
      actorId: input.idempotency.actor.id,
      operation: "conversation.create",
      idempotencyKey: input.idempotency.key,
      requestHash: input.idempotency.requestHash,
    })
    if (reservation.outcome === "conflict") {
      return { outcome: "idempotency_conflict" }
    }
    if (reservation.outcome === "replay") {
      const conversation = await getPublicConversation(
        tx,
        input.workspaceId,
        input.applicationId,
        input.externalSubjectId,
        reservation.resourceId
      )
      if (!conversation) throw new Error("Idempotent Conversation disappeared")
      return { outcome: "replay", conversation }
    }
    const identity = await resolveSubject(
      tx,
      input.workspaceId,
      input.applicationId,
      input.externalSubjectId
    )
    if (!identity) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "resource_not_found" }
    }
    const binding = await bindingAllows(
      tx,
      input.workspaceId,
      input.applicationId,
      input.workflowId,
      input.startKind
    )
    if (!binding) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "workflow_start_not_allowed" }
    }
    const result = await createConversation(tx, {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      workflowId: input.workflowId,
      externalSubjectId: input.externalSubjectId,
      environment: identity.environment,
      externalThreadKey: input.externalThreadKey,
      title: input.title,
      metadata: input.metadata,
    })
    if (result.outcome === "identity_invalid") {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "resource_not_found" }
    }
    if (result.outcome === "conversation_identity_conflict") {
      await releasePublicRequest(tx, reservation.recordId)
      return result
    }
    await finalizePublicRequest(
      tx,
      reservation.recordId,
      result.conversation.id
    )
    return { outcome: "created", conversation: result.conversation }
  })
}

export async function getPublicConversation(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string | undefined,
  conversationId: string
): Promise<Conversation | undefined> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.applicationId, applicationId),
        externalSubjectId
          ? eq(conversations.externalSubjectId, externalSubjectId)
          : undefined
      )
    )
  return conversation
}

export async function listPublicConversations(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string | undefined,
  limit: number,
  cursor: { lastActivityAt: Date; id: string } | undefined
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.applicationId, applicationId),
        externalSubjectId
          ? eq(conversations.externalSubjectId, externalSubjectId)
          : undefined,
        cursor
          ? or(
              lt(conversations.lastActivityAt, cursor.lastActivityAt),
              and(
                eq(conversations.lastActivityAt, cursor.lastActivityAt),
                lt(conversations.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(conversations.lastActivityAt), desc(conversations.id))
    .limit(limit)
}

export type StartPublicExecutionResult =
  | { outcome: "created" | "replay"; execution: Execution }
  | { outcome: "resource_not_found" }
  | { outcome: "workflow_start_not_allowed" }
  | { outcome: "workflow_binding_incompatible" }
  | { outcome: "validation_failed" }
  | { outcome: "idempotency_conflict" }

export async function startPublicExecution(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    workflowId: string
    conversationId?: string
    startKind: "backend" | "end_user"
    triggerPayload: Record<string, unknown>
    idempotency: Idempotency
  }
): Promise<StartPublicExecutionResult> {
  return db.transaction(async (tx): Promise<StartPublicExecutionResult> => {
    const reservation = await reservePublicRequest(tx, {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      actorKind: input.idempotency.actor.kind,
      actorId: input.idempotency.actor.id,
      operation: "execution.start",
      idempotencyKey: input.idempotency.key,
      requestHash: input.idempotency.requestHash,
    })
    if (reservation.outcome === "conflict") {
      return { outcome: "idempotency_conflict" }
    }
    if (reservation.outcome === "replay") {
      const execution = await getPublicExecution(
        tx,
        input.workspaceId,
        input.applicationId,
        input.externalSubjectId,
        reservation.resourceId
      )
      if (!execution) throw new Error("Idempotent Execution disappeared")
      return { outcome: "replay", execution }
    }
    const identity = await resolveSubject(
      tx,
      input.workspaceId,
      input.applicationId,
      input.externalSubjectId
    )
    if (!identity) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "resource_not_found" }
    }
    const binding = await bindingAllows(
      tx,
      input.workspaceId,
      input.applicationId,
      input.workflowId,
      input.startKind
    )
    if (!binding) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "workflow_start_not_allowed" }
    }
    if (input.conversationId) {
      const conversation = await getPublicConversation(
        tx,
        input.workspaceId,
        input.applicationId,
        input.externalSubjectId,
        input.conversationId
      )
      if (
        !conversation ||
        conversation.workflowId !== input.workflowId ||
        conversation.status !== "active"
      ) {
        await releasePublicRequest(tx, reservation.recordId)
        return { outcome: "resource_not_found" }
      }
    }
    const [version] = await tx
      .select({
        id: workflowVersions.id,
        contractRevisionId: workflowContractRevisions.id,
        inputSchema: workflowContractRevisions.inputSchema,
      })
      .from(workflowVersions)
      .innerJoin(
        workflowContractRevisions,
        and(
          eq(
            workflowContractRevisions.id,
            workflowVersions.workflowContractRevisionId
          ),
          eq(workflowContractRevisions.workflowId, workflowVersions.workflowId)
        )
      )
      .where(
        and(
          eq(workflowVersions.workflowId, input.workflowId),
          eq(
            workflowVersions.workflowContractRevisionId,
            binding.workflowContractRevisionId
          ),
          isNotNull(workflowVersions.publishedAt)
        )
      )
      .orderBy(desc(workflowVersions.version))
      .limit(1)
    if (!version) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "workflow_binding_incompatible" }
    }
    if (
      !jsonSchemaValidator.compile(version.inputSchema)(input.triggerPayload)
    ) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "validation_failed" }
    }
    const [execution] = await tx
      .insert(executions)
      .values({
        workspaceId: input.workspaceId,
        applicationId: input.applicationId,
        workflowId: input.workflowId,
        workflowVersionId: version.id,
        workflowContractRevisionId: version.contractRevisionId,
        externalSubjectRecordId: input.externalSubjectId,
        externalSubjectId: identity.issuerSubject,
        conversationId: input.conversationId,
        environment: identity.environment,
        trigger: "api",
        triggerPayload: input.triggerPayload,
      })
      .returning()
    await createWorkflowExecutionMessage(tx, {
      workspaceId: input.workspaceId,
      executionId: execution.id,
    })
    await finalizePublicRequest(tx, reservation.recordId, execution.id)
    return { outcome: "created", execution }
  })
}

export async function getPublicExecution(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string | undefined,
  executionId: string
): Promise<Execution | undefined> {
  const [execution] = await db
    .select()
    .from(executions)
    .where(
      and(
        eq(executions.id, executionId),
        eq(executions.workspaceId, workspaceId),
        eq(executions.applicationId, applicationId),
        externalSubjectId
          ? eq(executions.externalSubjectRecordId, externalSubjectId)
          : undefined
      )
    )
  return execution
}

export type CancelPublicExecutionResult =
  | { outcome: "cancelled"; execution: Execution }
  | { outcome: "resource_not_found" }
  | { outcome: "execution_not_cancellable" }
  | { outcome: "idempotency_conflict" }

export async function cancelPublicExecution(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  executionId: string,
  idempotency: Idempotency
): Promise<CancelPublicExecutionResult> {
  return db.transaction(async (tx): Promise<CancelPublicExecutionResult> => {
    const reservation = await reservePublicRequest(tx, {
      workspaceId,
      applicationId,
      actorKind: idempotency.actor.kind,
      actorId: idempotency.actor.id,
      operation: "execution.cancel",
      idempotencyKey: idempotency.key,
      requestHash: idempotency.requestHash,
    })
    if (reservation.outcome === "conflict") {
      return { outcome: "idempotency_conflict" }
    }
    if (reservation.outcome === "replay") {
      const execution = await getPublicExecution(
        tx,
        workspaceId,
        applicationId,
        undefined,
        reservation.resourceId
      )
      if (!execution) throw new Error("Idempotent Execution disappeared")
      return { outcome: "cancelled", execution }
    }
    const cancelledAt = new Date()
    const execution = await cancelExecutionWithPendingApproval(
      tx,
      workspaceId,
      applicationId,
      executionId,
      idempotency.actor.id,
      cancelledAt
    )
    if (execution) {
      await tx.insert(auditLogs).values({
        workspaceId,
        actorApplicationKeyId: idempotency.actor.id,
        action: "execution.cancelled",
        resource: "execution",
        resourceId: executionId,
        metadata: { applicationId, idempotencyKey: idempotency.key },
      })
      await finalizePublicRequest(tx, reservation.recordId, execution.id)
      return { outcome: "cancelled", execution }
    }
    const existing = await getPublicExecution(
      tx,
      workspaceId,
      applicationId,
      undefined,
      executionId
    )
    if (!existing) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "resource_not_found" }
    }
    if (existing.status === "cancelled") {
      await finalizePublicRequest(tx, reservation.recordId, existing.id)
      return { outcome: "cancelled", execution: existing }
    }
    await releasePublicRequest(tx, reservation.recordId)
    return { outcome: "execution_not_cancellable" }
  })
}

export type CreatePublicMessageResult =
  | { outcome: "created" | "replay"; message: ChatMessage }
  | { outcome: "resource_not_found" }
  | { outcome: "idempotency_conflict" }

export async function createPublicMessage(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    conversationId: string
    content: string
    idempotency: Idempotency
  }
): Promise<CreatePublicMessageResult> {
  return db.transaction(async (tx): Promise<CreatePublicMessageResult> => {
    const reservation = await reservePublicRequest(tx, {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      actorKind: input.idempotency.actor.kind,
      actorId: input.idempotency.actor.id,
      operation: "message.create",
      idempotencyKey: input.idempotency.key,
      requestHash: input.idempotency.requestHash,
    })
    if (reservation.outcome === "conflict") {
      return { outcome: "idempotency_conflict" }
    }
    if (reservation.outcome === "replay") {
      const [message] = await tx
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, reservation.resourceId),
            eq(chatMessages.workspaceId, input.workspaceId),
            eq(chatMessages.conversationId, input.conversationId)
          )
        )
      if (!message) throw new Error("Idempotent Message disappeared")
      return { outcome: "replay", message }
    }
    const conversation = await getPublicConversation(
      tx,
      input.workspaceId,
      input.applicationId,
      input.externalSubjectId,
      input.conversationId
    )
    if (!conversation || conversation.status !== "active") {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "resource_not_found" }
    }
    const message = await createChatMessage(tx, {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      clientMessageId: input.idempotency.key,
      role: "user",
      content: input.content,
    })
    await finalizePublicRequest(tx, reservation.recordId, message.id)
    return { outcome: "created", message }
  })
}

export async function listPublicMessages(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string,
  conversationId: string,
  limit: number,
  beforeSequence: number | undefined
): Promise<ChatMessage[] | undefined> {
  const conversation = await getPublicConversation(
    db,
    workspaceId,
    applicationId,
    externalSubjectId,
    conversationId
  )
  if (!conversation) return undefined
  return db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.conversationId, conversationId),
        beforeSequence ? lt(chatMessages.sequence, beforeSequence) : undefined
      )
    )
    .orderBy(desc(chatMessages.sequence))
    .limit(limit)
}
