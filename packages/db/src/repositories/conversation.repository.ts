import { and, desc, eq, sql } from "drizzle-orm"
import {
  applications,
  conversations,
  externalSubjectApplications,
  externalSubjects,
  workflows,
  type Conversation,
  type NewConversation,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type CreateConversationResult =
  | { outcome: "created"; conversation: Conversation }
  | { outcome: "existing"; conversation: Conversation }
  | { outcome: "identity_invalid" }
  | { outcome: "conversation_identity_conflict" }

type ConversationIdentity = Pick<
  NewConversation,
  | "workspaceId"
  | "applicationId"
  | "workflowId"
  | "externalSubjectId"
  | "environment"
>

function hasIdentity(
  conversation: Conversation,
  identity: ConversationIdentity
): boolean {
  return (
    conversation.workspaceId === identity.workspaceId &&
    conversation.applicationId === identity.applicationId &&
    conversation.workflowId === identity.workflowId &&
    conversation.externalSubjectId === identity.externalSubjectId &&
    conversation.environment === identity.environment
  )
}

async function identityExists(
  db: DbClient,
  identity: ConversationIdentity
): Promise<boolean> {
  const [row] = await db
    .select({ applicationKind: applications.kind })
    .from(applications)
    .innerJoin(
      workflows,
      and(
        eq(workflows.id, identity.workflowId),
        eq(workflows.workspaceId, identity.workspaceId)
      )
    )
    .innerJoin(
      externalSubjectApplications,
      and(
        eq(externalSubjectApplications.applicationId, identity.applicationId),
        eq(
          externalSubjectApplications.externalSubjectId,
          identity.externalSubjectId
        ),
        eq(externalSubjectApplications.workspaceId, identity.workspaceId)
      )
    )
    .where(
      and(
        eq(applications.id, identity.applicationId),
        eq(applications.workspaceId, identity.workspaceId),
        sql`(${applications.kind} = 'internal_builder' AND ${identity.environment} = 'draft') OR (${applications.kind} = 'operator' AND ${applications.environment}::text = ${identity.environment})`
      )
    )
  return row !== undefined
}

export async function createConversation(
  db: DbClient,
  input: NewConversation
): Promise<CreateConversationResult> {
  if (input.externalThreadKey) {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.applicationId, input.applicationId),
          eq(conversations.externalThreadKey, input.externalThreadKey)
        )
      )
    if (existing) {
      return hasIdentity(existing, input)
        ? { outcome: "existing", conversation: existing }
        : { outcome: "conversation_identity_conflict" }
    }
  }
  if (!(await identityExists(db, input))) return { outcome: "identity_invalid" }
  const [conversation] = await db
    .insert(conversations)
    .values(input)
    .onConflictDoNothing()
    .returning()
  if (conversation) return { outcome: "created", conversation }
  const [racedConversation] = await db
    .select()
    .from(conversations)
    .where(
      input.externalThreadKey
        ? and(
            eq(conversations.applicationId, input.applicationId),
            eq(conversations.externalThreadKey, input.externalThreadKey)
          )
        : eq(conversations.id, input.id ?? "")
    )
  if (!racedConversation || !hasIdentity(racedConversation, input)) {
    return { outcome: "conversation_identity_conflict" }
  }
  return { outcome: "existing", conversation: racedConversation }
}

export async function getConversation(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string,
  id: string
): Promise<Conversation | undefined> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.applicationId, applicationId),
        eq(conversations.externalSubjectId, externalSubjectId)
      )
    )
  return conversation
}

export async function listConversations(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.applicationId, applicationId),
        eq(conversations.externalSubjectId, externalSubjectId)
      )
    )
    .orderBy(desc(conversations.lastActivityAt), desc(conversations.id))
}

/** Pins the first Chat Preview subject even when initial turns race. */
export async function ensureBuilderConversation(
  db: DbClient,
  input: {
    id: string
    workspaceId: string
    workflowId: string
    externalSubjectKey: string | null
  }
): Promise<{ conversation: Conversation; externalSubjectKey: string | null }> {
  const lockKey = `${input.workspaceId}:${input.id}`
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
  )
  const [existing] = await db
    .select({
      conversation: conversations,
      issuerSubject: externalSubjects.issuerSubject,
    })
    .from(conversations)
    .innerJoin(
      applications,
      and(
        eq(applications.id, conversations.applicationId),
        eq(applications.kind, "internal_builder")
      )
    )
    .innerJoin(
      externalSubjects,
      eq(externalSubjects.id, conversations.externalSubjectId)
    )
    .where(
      and(
        eq(conversations.id, input.id),
        eq(conversations.workspaceId, input.workspaceId),
        eq(conversations.workflowId, input.workflowId)
      )
    )
  if (existing) {
    if (!existing.issuerSubject) {
      throw new Error("Builder External Subject has no subject key")
    }
    return {
      conversation: existing.conversation,
      externalSubjectKey:
        existing.issuerSubject === `anonymous:${existing.conversation.id}`
          ? null
          : existing.issuerSubject,
    }
  }
  const subjectKey = input.externalSubjectKey ?? `anonymous:${input.id}`
  const [insertedApplication] = await db
    .insert(applications)
    .values({
      workspaceId: input.workspaceId,
      kind: "internal_builder",
      environment: "dev",
      displayName: "Linea Builder",
      allowedBrowserOrigins: ["http://localhost"],
      allowedRedirectOrigins: ["http://localhost"],
      oidcIssuer: "urn:linea:builder",
      oidcClientId: "linea-builder",
      oidcAudience: "linea-builder",
      oidcJwksUrl: "http://localhost/.well-known/jwks.json",
      enabled: false,
    })
    .onConflictDoNothing()
    .returning()
  const [application] = insertedApplication
    ? [insertedApplication]
    : await db
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.kind, "internal_builder")
          )
        )
  if (!application) throw new Error("Builder Application was not created")
  const [insertedSubject] = await db
    .insert(externalSubjects)
    .values({
      workspaceId: input.workspaceId,
      issuer: "urn:linea:builder",
      issuerSubject: subjectKey,
      status: "verified",
      verifiedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()
  const [subject] = insertedSubject
    ? [insertedSubject]
    : await db
        .select()
        .from(externalSubjects)
        .where(
          and(
            eq(externalSubjects.workspaceId, input.workspaceId),
            eq(externalSubjects.issuer, "urn:linea:builder"),
            eq(externalSubjects.issuerSubject, subjectKey)
          )
        )
  if (!subject) throw new Error("Builder External Subject was not created")
  await db
    .insert(externalSubjectApplications)
    .values({
      workspaceId: input.workspaceId,
      applicationId: application.id,
      externalSubjectId: subject.id,
    })
    .onConflictDoNothing()
  const result = await createConversation(db, {
    id: input.id,
    workspaceId: input.workspaceId,
    applicationId: application.id,
    workflowId: input.workflowId,
    externalSubjectId: subject.id,
    environment: "draft",
  })
  if (result.outcome === "identity_invalid") {
    throw new Error("Builder Conversation identity is invalid")
  }
  if (result.outcome === "conversation_identity_conflict") {
    throw new Error("Conversation identity conflicts with the existing thread")
  }
  return {
    conversation: result.conversation,
    externalSubjectKey: input.externalSubjectKey,
  }
}
