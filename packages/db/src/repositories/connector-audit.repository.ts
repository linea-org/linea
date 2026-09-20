import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm"
import {
  actionIntents,
  applications,
  approvalRequests,
  connectorAuditFacts,
  externalSubjects,
  type ActionIntent,
  type Connection,
  type ConnectorAuditContent,
  type ConnectorAuditFact,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

const DAY_MS = 24 * 60 * 60 * 1_000

type ConnectionFactType =
  | "connection.created"
  | "connection.refreshed"
  | "connection.credential_rotated"
  | "connection.reauthorization_required"
  | "connection.revoked"
  | "connection.revocation_payload_destroyed"

type ActionIntentFactType =
  | "action_intent.created"
  | "action_intent.consent_approved"
  | "action_intent.consent_rejected"
  | "action_intent.ready"
  | "action_intent.executing"
  | "action_intent.succeeded"
  | "action_intent.failed"
  | "action_intent.stale"
  | "action_intent.rejected"
  | "action_intent.cancelled"
  | "action_intent.outcome_unknown"

function auditExpiry(occurredAt: Date): Date {
  const expiresAt = new Date(occurredAt)
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1)
  return expiresAt
}

async function retentionContext(
  tx: DbClient,
  applicationId: string,
  externalSubjectId: string
): Promise<{ contentRetentionDays: number; subjectReference: string }> {
  const [context] = await tx
    .select({
      contentRetentionDays: applications.contentRetentionDays,
      subjectReference: externalSubjects.auditReference,
    })
    .from(applications)
    .innerJoin(
      externalSubjects,
      eq(externalSubjects.workspaceId, applications.workspaceId)
    )
    .where(
      and(
        eq(applications.id, applicationId),
        eq(externalSubjects.id, externalSubjectId)
      )
    )
  if (!context) throw new Error("Connector audit retention context is missing")
  return context
}

export async function recordConnectionFact(
  tx: DbClient,
  input: {
    connection: Connection
    factType: ConnectionFactType
    occurredAt: Date
    outcome?: string
    failureClass?: string
    content?: ConnectorAuditContent
  }
): Promise<ConnectorAuditFact> {
  const context = await retentionContext(
    tx,
    input.connection.applicationId,
    input.connection.externalSubjectId
  )
  const auditExpiresAt = auditExpiry(input.occurredAt)
  const contentExpiresAt = new Date(
    Math.min(
      input.occurredAt.getTime() + context.contentRetentionDays * DAY_MS,
      auditExpiresAt.getTime()
    )
  )
  const [fact] = await tx
    .insert(connectorAuditFacts)
    .values({
      workspaceId: input.connection.workspaceId,
      applicationId: input.connection.applicationId,
      externalSubjectId: input.connection.externalSubjectId,
      subjectReference: context.subjectReference,
      connectionId: input.connection.id,
      factType: input.factType,
      provider: input.connection.provider,
      outcome: input.outcome,
      failureClass: input.failureClass,
      content: input.content,
      contentExpiresAt,
      auditExpiresAt,
      occurredAt: input.occurredAt,
    })
    .returning()
  if (!fact) throw new Error("Connection audit fact was not recorded")
  return fact
}

export async function recordActionIntentFact(
  tx: DbClient,
  input: {
    intent: ActionIntent
    factType: ActionIntentFactType
    occurredAt: Date
    decisionId?: string
    outcome?: string
    failureClass?: string
  }
): Promise<ConnectorAuditFact> {
  const context = await retentionContext(
    tx,
    input.intent.applicationId,
    input.intent.externalSubjectId
  )
  const auditExpiresAt = auditExpiry(input.occurredAt)
  const contentExpiresAt = new Date(
    Math.min(
      input.occurredAt.getTime() + context.contentRetentionDays * DAY_MS,
      auditExpiresAt.getTime()
    )
  )
  const [fact] = await tx
    .insert(connectorAuditFacts)
    .values({
      workspaceId: input.intent.workspaceId,
      applicationId: input.intent.applicationId,
      externalSubjectId: input.intent.externalSubjectId,
      subjectReference: context.subjectReference,
      connectionId: input.intent.connectionId,
      actionIntentId: input.intent.id,
      decisionId: input.decisionId,
      factType: input.factType,
      provider: input.intent.connector,
      operationId: input.intent.operationId,
      digest: input.intent.canonicalDigest,
      outcome: input.outcome,
      failureClass: input.failureClass,
      content: {
        display: input.intent.safeDisplay,
      },
      contentExpiresAt,
      auditExpiresAt,
      occurredAt: input.occurredAt,
    })
    .returning()
  if (!fact) throw new Error("Action Intent audit fact was not recorded")
  return fact
}

export type ConnectorAuditCursor = { occurredAt: Date; id: string }

function beforeCursor(cursor?: ConnectorAuditCursor) {
  return cursor
    ? or(
        lt(connectorAuditFacts.occurredAt, cursor.occurredAt),
        and(
          eq(connectorAuditFacts.occurredAt, cursor.occurredAt),
          lt(connectorAuditFacts.id, cursor.id)
        )
      )
    : undefined
}

export function listOperatorFacts(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId?: string
    limit: number
    cursor?: ConnectorAuditCursor
    now: Date
  }
): Promise<ConnectorAuditFact[]> {
  return db
    .select()
    .from(connectorAuditFacts)
    .where(
      and(
        eq(connectorAuditFacts.workspaceId, input.workspaceId),
        input.applicationId
          ? eq(connectorAuditFacts.applicationId, input.applicationId)
          : undefined,
        gt(connectorAuditFacts.auditExpiresAt, input.now),
        beforeCursor(input.cursor)
      )
    )
    .orderBy(desc(connectorAuditFacts.occurredAt), desc(connectorAuditFacts.id))
    .limit(input.limit)
}

const endUserFactTypes = [
  "connection.created",
  "connection.refreshed",
  "connection.credential_rotated",
  "connection.reauthorization_required",
  "connection.revoked",
  "connection.revocation_payload_destroyed",
  "action_intent.consent_approved",
  "action_intent.consent_rejected",
  "action_intent.succeeded",
  "action_intent.failed",
  "action_intent.stale",
  "action_intent.rejected",
  "action_intent.cancelled",
  "action_intent.outcome_unknown",
] as const

export function listEndUserFacts(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    limit: number
    cursor?: ConnectorAuditCursor
    now: Date
  }
): Promise<ConnectorAuditFact[]> {
  return db
    .select()
    .from(connectorAuditFacts)
    .where(
      and(
        eq(connectorAuditFacts.workspaceId, input.workspaceId),
        eq(connectorAuditFacts.applicationId, input.applicationId),
        eq(connectorAuditFacts.externalSubjectId, input.externalSubjectId),
        inArray(connectorAuditFacts.factType, endUserFactTypes),
        gt(connectorAuditFacts.auditExpiresAt, input.now),
        beforeCursor(input.cursor)
      )
    )
    .orderBy(desc(connectorAuditFacts.occurredAt), desc(connectorAuditFacts.id))
    .limit(input.limit)
}

export async function applyRetention(
  db: DbClient,
  now: Date
): Promise<{
  contentErased: number
  intentsErased: number
  factsDeleted: number
}> {
  return db.transaction(async (tx) => {
    const contentErased = await tx
      .update(connectorAuditFacts)
      .set({ content: null, contentErasedAt: now })
      .where(
        and(
          lte(connectorAuditFacts.contentExpiresAt, now),
          isNull(connectorAuditFacts.contentErasedAt)
        )
      )
      .returning({ id: connectorAuditFacts.id })
    const intentsErased = await tx
      .update(actionIntents)
      .set({
        target: { redacted: true },
        normalizedParameters: { redacted: true },
        providerPreconditions: { redacted: true },
        safeDisplay: { title: "Content expired" },
        canonicalEnvelope: sql`jsonb_build_object('version', 1, 'operationRevision', ${actionIntents.operationRevision}, 'connectionId', ${actionIntents.connectionId}::text, 'connector', ${actionIntents.connector}, 'operation', ${actionIntents.operationId}, 'target', jsonb_build_object('redacted', true), 'parameters', jsonb_build_object('redacted', true), 'providerPreconditions', jsonb_build_object('redacted', true))`,
        normalizedResult: null,
        normalizedError: null,
        contentErasedAt: now,
      })
      .from(applications)
      .where(
        and(
          eq(actionIntents.applicationId, applications.id),
          isNull(actionIntents.contentErasedAt),
          inArray(actionIntents.status, [
            "succeeded",
            "failed",
            "stale",
            "rejected",
            "cancelled",
            "outcome_unknown",
          ]),
          sql`${actionIntents.createdAt} + (${applications.contentRetentionDays} * interval '1 day') <= ${now}`
        )
      )
      .returning({
        id: actionIntents.id,
        approvalRequestId: actionIntents.approvalRequestId,
      })
    if (intentsErased.length > 0) {
      await tx
        .update(approvalRequests)
        .set({ display: { title: "Content expired" } })
        .where(
          inArray(
            approvalRequests.id,
            intentsErased.map(({ approvalRequestId }) => approvalRequestId)
          )
        )
    }
    const factsDeleted = await tx
      .delete(connectorAuditFacts)
      .where(lte(connectorAuditFacts.auditExpiresAt, now))
      .returning({ id: connectorAuditFacts.id })
    return {
      contentErased: contentErased.length,
      intentsErased: intentsErased.length,
      factsDeleted: factsDeleted.length,
    }
  })
}
