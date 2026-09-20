import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm"
import {
  applications,
  connectionReadUses,
  connectionAuthorizationRequests,
  connectionRevocationDeliveries,
  connections,
  endUserSessions,
  executions,
  externalSubjectApplications,
  externalSubjects,
  type Connection,
  type ConnectionAuthorizationRequest,
  type ConnectionReadUse,
  type ConnectionRevocationDelivery,
} from "../schema/index.js"
import { encryptCredential } from "../credential-encryption.js"
import { cancelNonExecutingActionIntents } from "./action-intent-cancellation.repository.js"
import type { DbClient } from "./types.js"

type CreateAuthorizationInput = {
  id: string
  workspaceId: string
  applicationId: string
  externalSubjectId: string
  endUserSessionId: string
  provider: string
  scopes: string[]
  returnUri: string
  stateHash: string
  codeVerifierEncrypted: string
  expiresAt: Date
  targetConnectionId?: string
}

export type CreateConnectionAuthorizationResult =
  | { outcome: "created"; request: ConnectionAuthorizationRequest }
  | { outcome: "application_unavailable" }
  | { outcome: "provider_denied" }
  | { outcome: "scope_denied" }
  | { outcome: "connection_unavailable" }
  | { outcome: "connection_scope_insufficient" }
  | { outcome: "return_uri_denied" }

export type ClaimConnectionAuthorizationResult =
  | { outcome: "claimed"; request: ConnectionAuthorizationRequest }
  | { outcome: "invalid" }

export async function claimConnectionAuthorizationRequest(
  db: DbClient,
  input: { provider: string; stateHash: string; now: Date }
): Promise<ClaimConnectionAuthorizationResult> {
  const [request] = await db
    .update(connectionAuthorizationRequests)
    .set({ claimedAt: input.now })
    .where(
      and(
        eq(connectionAuthorizationRequests.provider, input.provider),
        eq(connectionAuthorizationRequests.stateHash, input.stateHash),
        isNull(connectionAuthorizationRequests.claimedAt),
        isNull(connectionAuthorizationRequests.completedAt),
        gt(connectionAuthorizationRequests.expiresAt, input.now)
      )
    )
    .returning()
  return request ? { outcome: "claimed", request } : { outcome: "invalid" }
}

export type CompleteConnectionAuthorizationResult =
  | { outcome: "completed"; connection: Connection }
  | { outcome: "invalid" }

export async function completeConnectionAuthorizationRequest(
  db: DbClient,
  input: {
    authorizationRequestId: string
    claimedAt: Date
    connectionId: string
    providerAccountId: string
    accountLabel: string
    credentialPlaintext: string
    now: Date
  }
): Promise<CompleteConnectionAuthorizationResult> {
  return db.transaction(
    async (tx): Promise<CompleteConnectionAuthorizationResult> => {
      const [request] = await tx
        .select()
        .from(connectionAuthorizationRequests)
        .where(
          eq(connectionAuthorizationRequests.id, input.authorizationRequestId)
        )
        .for("update")
      if (
        request?.claimedAt?.getTime() !== input.claimedAt.getTime() ||
        request?.completedAt
      ) {
        return { outcome: "invalid" }
      }
      const [authority] = await tx
        .select({
          enabled: applications.enabled,
          connectorAccessPolicy: applications.connectorAccessPolicy,
          subjectStatus: externalSubjects.status,
          sessionExpiresAt: endUserSessions.expiresAt,
          sessionRevokedAt: endUserSessions.revokedAt,
        })
        .from(applications)
        .innerJoin(
          externalSubjectApplications,
          and(
            eq(
              externalSubjectApplications.applicationId,
              request.applicationId
            ),
            eq(externalSubjectApplications.workspaceId, request.workspaceId),
            eq(
              externalSubjectApplications.externalSubjectId,
              request.externalSubjectId
            )
          )
        )
        .innerJoin(
          externalSubjects,
          and(
            eq(externalSubjects.id, request.externalSubjectId),
            eq(externalSubjects.workspaceId, request.workspaceId)
          )
        )
        .innerJoin(
          endUserSessions,
          and(
            eq(endUserSessions.id, request.endUserSessionId),
            eq(endUserSessions.workspaceId, request.workspaceId),
            eq(endUserSessions.applicationId, request.applicationId),
            eq(endUserSessions.externalSubjectId, request.externalSubjectId)
          )
        )
        .where(
          and(
            eq(applications.id, request.applicationId),
            eq(applications.workspaceId, request.workspaceId)
          )
        )
        .for("share")
      const providerPolicy = authority?.connectorAccessPolicy.providers.find(
        (candidate) => candidate.provider === request.provider
      )
      if (
        !authority?.enabled ||
        authority.subjectStatus !== "verified" ||
        authority.sessionRevokedAt ||
        authority.sessionExpiresAt <= input.now ||
        !providerPolicy ||
        request.scopes.some(
          (scope) => !providerPolicy.maxScopes.includes(scope)
        )
      ) {
        return { outcome: "invalid" }
      }
      const [accountConnection] = await tx
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.workspaceId, request.workspaceId),
            eq(connections.applicationId, request.applicationId),
            eq(connections.externalSubjectId, request.externalSubjectId),
            eq(connections.provider, request.provider),
            eq(connections.providerAccountId, input.providerAccountId),
            sql`${connections.status} <> 'revoked'`
          )
        )
        .for("update")
      const [targetConnection] = request.targetConnectionId
        ? await tx
            .select()
            .from(connections)
            .where(
              and(
                eq(connections.id, request.targetConnectionId),
                eq(connections.workspaceId, request.workspaceId),
                eq(connections.applicationId, request.applicationId),
                eq(connections.externalSubjectId, request.externalSubjectId),
                eq(connections.provider, request.provider),
                sql`${connections.status} <> 'revoked'`
              )
            )
            .for("update")
        : [undefined]
      if (
        request.targetConnectionId &&
        (!targetConnection ||
          targetConnection.providerAccountId !== input.providerAccountId)
      ) {
        return { outcome: "invalid" }
      }
      const existing = targetConnection ?? accountConnection
      const connectionId = existing?.id ?? input.connectionId
      const credentialEncrypted = encryptCredential(input.credentialPlaintext, {
        workspaceId: request.workspaceId,
        applicationId: request.applicationId,
        externalSubjectId: request.externalSubjectId,
        recordId: connectionId,
        provider: request.provider,
      })
      const [connection] = existing
        ? await tx
            .update(connections)
            .set({
              accountLabel: input.accountLabel,
              status: "active",
              scopes: request.scopes,
              credentialEncrypted,
              credentialVersion: sql`${connections.credentialVersion} + 1`,
              updatedAt: input.now,
            })
            .where(eq(connections.id, existing.id))
            .returning()
        : await tx
            .insert(connections)
            .values({
              id: input.connectionId,
              workspaceId: request.workspaceId,
              applicationId: request.applicationId,
              externalSubjectId: request.externalSubjectId,
              provider: request.provider,
              providerAccountId: input.providerAccountId,
              accountLabel: input.accountLabel,
              status: "active",
              scopes: request.scopes,
              credentialEncrypted,
              createdAt: input.now,
              updatedAt: input.now,
            })
            .returning()
      await tx
        .update(connectionAuthorizationRequests)
        .set({
          completedAt: input.now,
          outcome: "succeeded",
          resultConnectionId: connection.id,
          codeVerifierEncrypted: null,
        })
        .where(eq(connectionAuthorizationRequests.id, request.id))
      return { outcome: "completed", connection }
    }
  )
}

export async function failConnectionAuthorizationRequest(
  db: DbClient,
  input: { authorizationRequestId: string; claimedAt: Date; completedAt: Date }
): Promise<boolean> {
  const [request] = await db
    .update(connectionAuthorizationRequests)
    .set({
      completedAt: input.completedAt,
      outcome: "failed",
      codeVerifierEncrypted: null,
    })
    .where(
      and(
        eq(connectionAuthorizationRequests.id, input.authorizationRequestId),
        eq(connectionAuthorizationRequests.claimedAt, input.claimedAt),
        isNull(connectionAuthorizationRequests.completedAt)
      )
    )
    .returning({ id: connectionAuthorizationRequests.id })
  return Boolean(request)
}

type ConnectionOwner = {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
}

function ownedConnection(owner: ConnectionOwner, connectionId?: string) {
  return and(
    eq(connections.workspaceId, owner.workspaceId),
    eq(connections.applicationId, owner.applicationId),
    eq(connections.externalSubjectId, owner.externalSubjectId),
    connectionId ? eq(connections.id, connectionId) : undefined
  )
}

export function listConnections(
  db: DbClient,
  owner: ConnectionOwner
): Promise<Connection[]> {
  return db
    .select()
    .from(connections)
    .where(ownedConnection(owner))
    .orderBy(desc(connections.createdAt))
}

export async function getConnection(
  db: DbClient,
  owner: ConnectionOwner,
  connectionId: string
): Promise<Connection | undefined> {
  const [connection] = await db
    .select()
    .from(connections)
    .where(ownedConnection(owner, connectionId))
  return connection
}

export async function getConnectionAuthorizationRequest(
  db: DbClient,
  owner: ConnectionOwner,
  authorizationRequestId: string
): Promise<ConnectionAuthorizationRequest | undefined> {
  const [request] = await db
    .select()
    .from(connectionAuthorizationRequests)
    .where(
      and(
        eq(connectionAuthorizationRequests.id, authorizationRequestId),
        eq(connectionAuthorizationRequests.workspaceId, owner.workspaceId),
        eq(connectionAuthorizationRequests.applicationId, owner.applicationId),
        eq(
          connectionAuthorizationRequests.externalSubjectId,
          owner.externalSubjectId
        )
      )
    )
  return request
}

export type ConnectionCursor = { createdAt: Date; id: string }

export function findConnections(
  db: DbClient,
  input: ConnectionOwner & { limit: number; cursor?: ConnectionCursor }
): Promise<Connection[]> {
  return db
    .select()
    .from(connections)
    .where(
      and(
        ownedConnection(input),
        input.cursor
          ? or(
              lt(connections.createdAt, input.cursor.createdAt),
              and(
                eq(connections.createdAt, input.cursor.createdAt),
                lt(connections.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(connections.createdAt), desc(connections.id))
    .limit(input.limit)
}

export async function recordConnectionReadUse(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    connectionId: string
    executionId: string
    operationId: string
    outcome: "succeeded" | "failed"
    occurredAt: Date
  }
): Promise<ConnectionReadUse> {
  const [use] = await db.insert(connectionReadUses).values(input).returning()
  if (!use) throw new Error("Connection read use was not recorded")
  return use
}

export type ConnectionUseCursor = { occurredAt: Date; id: string }

export function findConnectionReadUses(
  db: DbClient,
  input: ConnectionOwner & {
    connectionId: string
    limit: number
    cursor?: ConnectionUseCursor
  }
): Promise<ConnectionReadUse[]> {
  return db
    .select()
    .from(connectionReadUses)
    .where(
      and(
        eq(connectionReadUses.workspaceId, input.workspaceId),
        eq(connectionReadUses.applicationId, input.applicationId),
        eq(connectionReadUses.externalSubjectId, input.externalSubjectId),
        eq(connectionReadUses.connectionId, input.connectionId),
        input.cursor
          ? or(
              lt(connectionReadUses.occurredAt, input.cursor.occurredAt),
              and(
                eq(connectionReadUses.occurredAt, input.cursor.occurredAt),
                lt(connectionReadUses.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(connectionReadUses.occurredAt), desc(connectionReadUses.id))
    .limit(input.limit)
}

export async function getConnectorReadAuthority(
  db: DbClient,
  input: { executionId: string; workspaceId: string; connectionId: string }
): Promise<
  | {
      connection: Connection
      providerPolicy: {
        provider: string
        actionFamilies: string[]
        maxScopes: string[]
      }
    }
  | undefined
> {
  const [authority] = await db
    .select({
      connection: connections,
      policy: applications.connectorAccessPolicy,
    })
    .from(executions)
    .innerJoin(
      applications,
      and(
        eq(applications.id, executions.applicationId),
        eq(applications.workspaceId, executions.workspaceId),
        eq(applications.enabled, true)
      )
    )
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, executions.externalSubjectRecordId),
        eq(externalSubjects.workspaceId, executions.workspaceId),
        eq(externalSubjects.status, "verified")
      )
    )
    .innerJoin(
      externalSubjectApplications,
      and(
        eq(externalSubjectApplications.applicationId, executions.applicationId),
        eq(
          externalSubjectApplications.externalSubjectId,
          executions.externalSubjectRecordId
        ),
        eq(externalSubjectApplications.workspaceId, executions.workspaceId)
      )
    )
    .innerJoin(
      connections,
      and(
        eq(connections.id, input.connectionId),
        eq(connections.workspaceId, executions.workspaceId),
        eq(connections.applicationId, executions.applicationId),
        eq(connections.externalSubjectId, executions.externalSubjectRecordId)
      )
    )
    .where(
      and(
        eq(executions.id, input.executionId),
        eq(executions.workspaceId, input.workspaceId)
      )
    )
  if (!authority) return undefined
  const providerPolicy = authority.policy.providers.find(
    (candidate) => candidate.provider === authority.connection.provider
  )
  return providerPolicy
    ? { connection: authority.connection, providerPolicy }
    : undefined
}

export async function revokeConnection(
  db: DbClient,
  owner: ConnectionOwner,
  connectionId: string,
  input: {
    expectedCredentialVersion: number
    deliveryId?: string
    revocationCredentialEncrypted?: string
    actorEndUserSessionId: string
    expiresAt: Date
    now: Date
  }
): Promise<
  | { outcome: "revoked"; connection: Connection; deliveryId?: string }
  | { outcome: "not_found" }
  | { outcome: "conflict" }
> {
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .update(connections)
      .set({
        status: "revoked",
        credentialEncrypted: null,
        revokedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          ownedConnection(owner, connectionId),
          sql`${connections.status} <> 'revoked'`,
          eq(connections.credentialVersion, input.expectedCredentialVersion)
        )
      )
      .returning()
    if (!connection) {
      const existing = await getConnection(tx, owner, connectionId)
      return existing ? { outcome: "conflict" } : { outcome: "not_found" }
    }
    await cancelNonExecutingActionIntents(tx, {
      workspaceId: owner.workspaceId,
      scope: { kind: "connection", id: connection.id },
      actor: {
        kind: "end_user_session",
        id: input.actorEndUserSessionId,
        externalSubjectId: owner.externalSubjectId,
      },
      cancelledAt: input.now,
    })
    if (input.deliveryId && input.revocationCredentialEncrypted) {
      await tx.insert(connectionRevocationDeliveries).values({
        id: input.deliveryId,
        workspaceId: owner.workspaceId,
        connectionId,
        provider: connection.provider,
        credentialEncrypted: input.revocationCredentialEncrypted,
        expiresAt: input.expiresAt,
        createdAt: input.now,
      })
    }
    return { outcome: "revoked", connection, deliveryId: input.deliveryId }
  })
}

export async function claimRevocationDelivery(
  db: DbClient,
  input: {
    claimedBy: string
    now: Date
    claimExpiresAt: Date
  }
): Promise<
  { delivery: ConnectionRevocationDelivery; connection: Connection } | undefined
> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: connectionRevocationDeliveries.id })
      .from(connectionRevocationDeliveries)
      .where(
        and(
          isNull(connectionRevocationDeliveries.deliveredAt),
          lte(connectionRevocationDeliveries.availableAt, input.now),
          gt(connectionRevocationDeliveries.expiresAt, input.now),
          or(
            isNull(connectionRevocationDeliveries.claimedBy),
            lte(connectionRevocationDeliveries.claimExpiresAt, input.now)
          )
        )
      )
      .orderBy(
        asc(connectionRevocationDeliveries.availableAt),
        asc(connectionRevocationDeliveries.id)
      )
      .for("update", { skipLocked: true })
      .limit(1)
    if (!candidate) return undefined
    const [delivery] = await tx
      .update(connectionRevocationDeliveries)
      .set({
        attemptCount: sql`${connectionRevocationDeliveries.attemptCount} + 1`,
        lastAttemptAt: input.now,
        claimedBy: input.claimedBy,
        claimExpiresAt: input.claimExpiresAt,
      })
      .where(eq(connectionRevocationDeliveries.id, candidate.id))
      .returning()
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.id, delivery.connectionId))
    if (!connection) throw new Error("Revocation Connection is missing")
    return { delivery, connection }
  })
}

export async function completeRevocationDelivery(
  db: DbClient,
  input: { deliveryId: string; claimedBy: string; deliveredAt: Date }
): Promise<boolean> {
  const [delivery] = await db
    .update(connectionRevocationDeliveries)
    .set({
      deliveredAt: input.deliveredAt,
      credentialEncrypted: null,
      claimedBy: null,
      claimExpiresAt: null,
    })
    .where(
      and(
        eq(connectionRevocationDeliveries.id, input.deliveryId),
        eq(connectionRevocationDeliveries.claimedBy, input.claimedBy),
        isNull(connectionRevocationDeliveries.deliveredAt)
      )
    )
    .returning({ id: connectionRevocationDeliveries.id })
  return Boolean(delivery)
}

export async function recordRevocationDeliveryFailure(
  db: DbClient,
  input: {
    deliveryId: string
    claimedBy: string
    retryAt: Date
  }
): Promise<boolean> {
  const [delivery] = await db
    .update(connectionRevocationDeliveries)
    .set({
      availableAt: input.retryAt,
      claimedBy: null,
      claimExpiresAt: null,
    })
    .where(
      and(
        eq(connectionRevocationDeliveries.id, input.deliveryId),
        eq(connectionRevocationDeliveries.claimedBy, input.claimedBy),
        isNull(connectionRevocationDeliveries.deliveredAt)
      )
    )
    .returning({ id: connectionRevocationDeliveries.id })
  return Boolean(delivery)
}

export async function renewRevocationDeliveryClaim(
  db: DbClient,
  input: { deliveryId: string; claimedBy: string; claimExpiresAt: Date }
): Promise<boolean> {
  const [delivery] = await db
    .update(connectionRevocationDeliveries)
    .set({ claimExpiresAt: input.claimExpiresAt })
    .where(
      and(
        eq(connectionRevocationDeliveries.id, input.deliveryId),
        eq(connectionRevocationDeliveries.claimedBy, input.claimedBy),
        isNull(connectionRevocationDeliveries.deliveredAt)
      )
    )
    .returning({ id: connectionRevocationDeliveries.id })
  return Boolean(delivery)
}

export async function deleteExpiredRevocationDeliveries(
  db: DbClient,
  now: Date
): Promise<number> {
  const deleted = await db
    .delete(connectionRevocationDeliveries)
    .where(
      and(
        isNull(connectionRevocationDeliveries.deliveredAt),
        lt(connectionRevocationDeliveries.expiresAt, now)
      )
    )
    .returning({ id: connectionRevocationDeliveries.id })
  return deleted.length
}

export async function deleteExpiredConnectionAuthorizationRequests(
  db: DbClient,
  now: Date
): Promise<number> {
  const deleted = await db
    .delete(connectionAuthorizationRequests)
    .where(lte(connectionAuthorizationRequests.expiresAt, now))
    .returning({ id: connectionAuthorizationRequests.id })
  return deleted.length
}

export async function rotateConnectionCredential(
  db: DbClient,
  owner: ConnectionOwner,
  connectionId: string,
  expectedCredentialVersion: number,
  credentialEncrypted: string,
  now: Date
): Promise<Connection | undefined> {
  const [connection] = await db
    .update(connections)
    .set({
      credentialEncrypted,
      credentialVersion: sql`${connections.credentialVersion} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        ownedConnection(owner, connectionId),
        eq(connections.status, "active"),
        eq(connections.credentialVersion, expectedCredentialVersion)
      )
    )
    .returning()
  return connection
}

export async function requireConnectionReauthorization(
  db: DbClient,
  owner: ConnectionOwner,
  connectionId: string,
  expectedCredentialVersion: number,
  now: Date
): Promise<Connection | undefined> {
  const [connection] = await db
    .update(connections)
    .set({
      status: "reauthorization_required",
      credentialEncrypted: null,
      credentialVersion: sql`${connections.credentialVersion} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        ownedConnection(owner, connectionId),
        eq(connections.status, "active"),
        eq(connections.credentialVersion, expectedCredentialVersion)
      )
    )
    .returning()
  return connection
}

function origin(value: string): string {
  const url = new URL(value)
  return url.origin === "null" ? `${url.protocol}//${url.host}` : url.origin
}

export async function createConnectionAuthorizationRequest(
  db: DbClient,
  input: CreateAuthorizationInput
): Promise<CreateConnectionAuthorizationResult> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .select({
        allowedRedirectOrigins: applications.allowedRedirectOrigins,
        connectorAccessPolicy: applications.connectorAccessPolicy,
      })
      .from(applications)
      .innerJoin(
        externalSubjectApplications,
        and(
          eq(externalSubjectApplications.applicationId, applications.id),
          eq(externalSubjectApplications.workspaceId, applications.workspaceId),
          eq(
            externalSubjectApplications.externalSubjectId,
            input.externalSubjectId
          )
        )
      )
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.enabled, true)
        )
      )
      .for("share")
    if (!application) return { outcome: "application_unavailable" }
    if (!application.allowedRedirectOrigins.includes(origin(input.returnUri))) {
      return { outcome: "return_uri_denied" }
    }
    const provider = application.connectorAccessPolicy.providers.find(
      (candidate) => candidate.provider === input.provider
    )
    if (!provider) return { outcome: "provider_denied" }
    if (input.scopes.some((scope) => !provider.maxScopes.includes(scope))) {
      return { outcome: "scope_denied" }
    }
    if (input.targetConnectionId) {
      const [connection] = await tx
        .select()
        .from(connections)
        .where(
          and(
            ownedConnection(input, input.targetConnectionId),
            eq(connections.provider, input.provider),
            sql`${connections.status} <> 'revoked'`
          )
        )
        .for("share")
      if (!connection) return { outcome: "connection_unavailable" }
      if (connection.scopes.some((scope) => !input.scopes.includes(scope))) {
        return { outcome: "connection_scope_insufficient" }
      }
      if (
        connection.status === "active" &&
        input.scopes.every((scope) => connection.scopes.includes(scope))
      ) {
        return { outcome: "connection_scope_insufficient" }
      }
    }
    const [request] = await tx
      .insert(connectionAuthorizationRequests)
      .values(input)
      .returning()
    return { outcome: "created", request }
  })
}
