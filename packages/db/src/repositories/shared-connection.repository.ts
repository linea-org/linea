import { and, desc, eq, isNull, ne } from "drizzle-orm"
import {
  connections,
  environments,
  connectionAccessGrants,
  connectionReviewerAssignments,
  externalSubjects,
  externalSubjectEnvironments,
  auditLogs,
  type Connection,
} from "../schema/index.js"
import { cancelNonExecutingActionIntents } from "./action-intent-cancellation.repository.js"
import { recordConnectionFact } from "./connector-audit.repository.js"
import type { DbClient } from "./types.js"

export class SharedConnectionAuthorizationError extends Error {}

type EnvironmentConnectionOwner = { workspaceId: string; environmentId: string }
type SubjectAuthorizationKind = "requester" | "reviewer"
const authorizationTables = {
  requester: connectionAccessGrants,
  reviewer: connectionReviewerAssignments,
}

export function createSharedEnvironmentConnection(
  db: DbClient,
  input: EnvironmentConnectionOwner & {
    id: string
    actorUserId: string
    providerAccountId: string
    accountLabel: string
    scopes: string[]
    credentialEncrypted: string
  }
): Promise<Connection> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.id, input.environmentId),
          eq(environments.workspaceId, input.workspaceId)
        )
      )
      .for("update")
    const policy = environment?.connectorAccessPolicy.providers.find(
      (provider) => provider.provider === "github"
    )
    if (
      !environment?.enabled ||
      !policy ||
      input.scopes.some((scope) => !policy.maxScopes.includes(scope))
    )
      throw new SharedConnectionAuthorizationError(
        "Environment GitHub policy does not authorize these installation permissions"
      )
    const [connection] = await tx
      .insert(connections)
      .values({
        id: input.id,
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        externalSubjectId: null,
        ownership: "environment",
        authorizationKind: "github_app_installation",
        provider: "github",
        providerAccountId: input.providerAccountId,
        accountLabel: input.accountLabel,
        scopes: input.scopes,
        credentialEncrypted: input.credentialEncrypted,
        status: "active",
      })
      .onConflictDoNothing()
      .returning()
    if (!connection)
      throw new SharedConnectionAuthorizationError(
        "GitHub installation is already connected in this Environment"
      )
    await recordConnectionFact(tx, {
      connection,
      factType: "connection.created",
      occurredAt: new Date(),
      content: { accountLabel: connection.accountLabel },
    })
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "connection.shared_created",
      resource: "connection",
      resourceId: connection.id,
    })
    return connection
  })
}

export function listEnvironmentConnections(
  db: DbClient,
  owner: EnvironmentConnectionOwner
): Promise<Connection[]> {
  return db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.workspaceId, owner.workspaceId),
        eq(connections.environmentId, owner.environmentId),
        eq(connections.ownership, "environment")
      )
    )
    .orderBy(desc(connections.createdAt))
}

export async function getSharedEnvironmentConnection(
  db: DbClient,
  owner: EnvironmentConnectionOwner,
  connectionId: string
): Promise<Connection | undefined> {
  const [connection] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.workspaceId, owner.workspaceId),
        eq(connections.environmentId, owner.environmentId),
        eq(connections.ownership, "environment")
      )
    )
  return connection
}

export function setConnectionSubjectAuthorization(
  db: DbClient,
  input: EnvironmentConnectionOwner & {
    connectionId: string
    externalSubjectId: string
    actorUserId: string
    kind: SubjectAuthorizationKind
  }
) {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.id, input.environmentId),
          eq(environments.workspaceId, input.workspaceId)
        )
      )
      .for("update")
    const connection = await getSharedEnvironmentConnection(
      tx,
      input,
      input.connectionId
    )
    const [subject] = await tx
      .select({ id: externalSubjects.id })
      .from(externalSubjects)
      .innerJoin(
        externalSubjectEnvironments,
        and(
          eq(
            externalSubjectEnvironments.externalSubjectId,
            externalSubjects.id
          ),
          eq(externalSubjectEnvironments.environmentId, input.environmentId),
          eq(externalSubjectEnvironments.workspaceId, input.workspaceId)
        )
      )
      .where(
        and(
          eq(externalSubjects.id, input.externalSubjectId),
          eq(externalSubjects.workspaceId, input.workspaceId),
          ne(externalSubjects.status, "disabled"),
          ne(externalSubjects.status, "erased")
        )
      )
      .for("share", { of: externalSubjects })
    if (!environment?.enabled || connection?.status !== "active" || !subject)
      throw new SharedConnectionAuthorizationError(
        "Shared Connection or Environment Subject is unavailable"
      )
    const table = authorizationTables[input.kind]
    const [created] = await tx
      .insert(table)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        connectionId: connection.id,
        externalSubjectId: subject.id,
      })
      .onConflictDoNothing()
      .returning()
    const [existing] = created
      ? [created]
      : await tx
          .select()
          .from(table)
          .where(
            and(
              eq(table.connectionId, connection.id),
              eq(table.externalSubjectId, subject.id),
              isNull(table.revokedAt)
            )
          )
    if (!existing)
      throw new SharedConnectionAuthorizationError(
        "Connection authorization could not be recorded"
      )
    if (created)
      await tx.insert(auditLogs).values({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: `connection.${input.kind}_assigned`,
        resource: "connection",
        resourceId: connection.id,
        metadata: {
          externalSubjectId: subject.id,
          authorizationId: created.id,
        },
      })
    return existing
  })
}

export async function listConnectionAuthorities(
  db: DbClient,
  owner: EnvironmentConnectionOwner,
  connectionId: string
) {
  const connection = await getSharedEnvironmentConnection(
    db,
    owner,
    connectionId
  )
  if (!connection)
    throw new SharedConnectionAuthorizationError("Shared Connection not found")
  const grants = await db
    .select()
    .from(connectionAccessGrants)
    .where(eq(connectionAccessGrants.connectionId, connection.id))
    .orderBy(desc(connectionAccessGrants.createdAt))
  const reviewers = await db
    .select()
    .from(connectionReviewerAssignments)
    .where(eq(connectionReviewerAssignments.connectionId, connection.id))
    .orderBy(desc(connectionReviewerAssignments.createdAt))
  return { grants, reviewers }
}

export function revokeConnectionSubjectAuthorization(
  db: DbClient,
  input: EnvironmentConnectionOwner & {
    connectionId: string
    authorizationId: string
    actorUserId: string
    kind: SubjectAuthorizationKind
  }
) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: environments.id })
      .from(environments)
      .where(
        and(
          eq(environments.id, input.environmentId),
          eq(environments.workspaceId, input.workspaceId)
        )
      )
      .for("update")
    const connection = await getSharedEnvironmentConnection(
      tx,
      input,
      input.connectionId
    )
    if (!connection)
      throw new SharedConnectionAuthorizationError(
        "Shared Connection not found"
      )
    const table = authorizationTables[input.kind]
    const [existing] = await tx
      .select()
      .from(table)
      .where(
        and(
          eq(table.id, input.authorizationId),
          eq(table.connectionId, connection.id)
        )
      )
      .for("update")
    if (!existing)
      throw new SharedConnectionAuthorizationError(
        "Connection authorization not found"
      )
    if (existing.revokedAt) return existing
    const now = new Date()
    const [revoked] = await tx
      .update(table)
      .set({ revokedAt: now })
      .where(eq(table.id, existing.id))
      .returning()
    if (input.kind === "requester")
      await cancelNonExecutingActionIntents(tx, {
        workspaceId: input.workspaceId,
        scope: { kind: "connection_access_grant", id: existing.id },
        actor: { kind: "workspace_member", id: input.actorUserId },
        cancelledAt: now,
      })
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: `connection.${input.kind}_revoked`,
      resource: "connection",
      resourceId: connection.id,
      metadata: {
        externalSubjectId: existing.externalSubjectId,
        authorizationId: existing.id,
      },
    })
    return revoked
  })
}

export function revokeSharedEnvironmentConnection(
  db: DbClient,
  input: EnvironmentConnectionOwner & {
    connectionId: string
    actorUserId: string
  }
): Promise<Connection> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: environments.id })
      .from(environments)
      .where(
        and(
          eq(environments.id, input.environmentId),
          eq(environments.workspaceId, input.workspaceId)
        )
      )
      .for("update")
    const connection = await getSharedEnvironmentConnection(
      tx,
      input,
      input.connectionId
    )
    if (!connection)
      throw new SharedConnectionAuthorizationError(
        "Shared Connection not found"
      )
    if (connection.status === "revoked") return connection
    const now = new Date()
    await cancelNonExecutingActionIntents(tx, {
      workspaceId: input.workspaceId,
      scope: { kind: "connection", id: connection.id },
      actor: { kind: "workspace_member", id: input.actorUserId },
      cancelledAt: now,
    })
    const [revoked] = await tx
      .update(connections)
      .set({
        status: "revoked",
        credentialEncrypted: null,
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(connections.id, connection.id))
      .returning()
    await recordConnectionFact(tx, {
      connection: revoked,
      factType: "connection.revoked",
      occurredAt: now,
      outcome: "revoked",
    })
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "connection.shared_revoked",
      resource: "connection",
      resourceId: connection.id,
    })
    return revoked
  })
}
