import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm"
import {
  environments,
  endUserIdentityExchanges,
  endUserSessionProofs,
  endUserSessions,
  externalSubjects,
  type EndUserIdentityExchange,
  type EndUserSession,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function findIdentityExchange(
  db: DbClient,
  tokenHash: string,
  now: Date
): Promise<
  | {
      exchange: EndUserIdentityExchange
      allowedBrowserOrigins: string[]
    }
  | undefined
> {
  const [result] = await db
    .select({
      exchange: endUserIdentityExchanges,
      allowedBrowserOrigins: environments.allowedBrowserOrigins,
    })
    .from(endUserIdentityExchanges)
    .innerJoin(
      environments,
      and(
        eq(environments.id, endUserIdentityExchanges.environmentId),
        eq(environments.workspaceId, endUserIdentityExchanges.workspaceId)
      )
    )
    .where(
      and(
        eq(endUserIdentityExchanges.tokenHash, tokenHash),
        isNotNull(endUserIdentityExchanges.dpopNonceHash),
        isNull(endUserIdentityExchanges.consumedAt),
        gt(endUserIdentityExchanges.expiresAt, now),
        sql`EXISTS (
          SELECT 1 FROM ${environments}
          WHERE ${environments.id} = ${endUserIdentityExchanges.environmentId}
            AND ${environments.workspaceId} = ${endUserIdentityExchanges.workspaceId}
            AND ${environments.enabled} = true
        )`,
        sql`EXISTS (
          SELECT 1 FROM ${externalSubjects}
          WHERE ${externalSubjects.id} = ${endUserIdentityExchanges.externalSubjectId}
            AND ${externalSubjects.workspaceId} = ${endUserIdentityExchanges.workspaceId}
            AND ${externalSubjects.status} = 'verified'
        )`
      )
    )
  return result
}

export async function createEndUserSession(
  db: DbClient,
  input: {
    exchangeId: string
    exchangeTokenHash: string
    workspaceId: string
    environmentId: string
    externalSubjectId: string
    tokenHash: string
    proofJkt: string
    nonceHash: string
    expiresAt: Date
    now: Date
  }
): Promise<EndUserSession | undefined> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select({ id: environments.id })
      .from(environments)
      .where(
        and(
          eq(environments.id, input.environmentId),
          eq(environments.workspaceId, input.workspaceId),
          eq(environments.enabled, true)
        )
      )
      .for("share")
    if (!environment) return undefined
    const [subject] = await tx
      .select({ id: externalSubjects.id })
      .from(externalSubjects)
      .where(
        and(
          eq(externalSubjects.id, input.externalSubjectId),
          eq(externalSubjects.workspaceId, input.workspaceId),
          eq(externalSubjects.status, "verified")
        )
      )
      .for("share")
    if (!subject) return undefined
    const [exchange] = await tx
      .update(endUserIdentityExchanges)
      .set({ consumedAt: input.now })
      .where(
        and(
          eq(endUserIdentityExchanges.id, input.exchangeId),
          eq(endUserIdentityExchanges.tokenHash, input.exchangeTokenHash),
          eq(endUserIdentityExchanges.workspaceId, input.workspaceId),
          eq(endUserIdentityExchanges.environmentId, input.environmentId),
          eq(
            endUserIdentityExchanges.externalSubjectId,
            input.externalSubjectId
          ),
          isNull(endUserIdentityExchanges.consumedAt),
          gt(endUserIdentityExchanges.expiresAt, input.now),
          sql`EXISTS (
            SELECT 1 FROM ${environments}
            WHERE ${environments.id} = ${endUserIdentityExchanges.environmentId}
              AND ${environments.workspaceId} = ${endUserIdentityExchanges.workspaceId}
              AND ${environments.enabled} = true
          )`,
          sql`EXISTS (
            SELECT 1 FROM ${externalSubjects}
            WHERE ${externalSubjects.id} = ${endUserIdentityExchanges.externalSubjectId}
              AND ${externalSubjects.workspaceId} = ${endUserIdentityExchanges.workspaceId}
              AND ${externalSubjects.status} = 'verified'
          )`
        )
      )
      .returning()
    if (!exchange) return undefined
    const [session] = await tx
      .insert(endUserSessions)
      .values({
        workspaceId: exchange.workspaceId,
        environmentId: exchange.environmentId,
        externalSubjectId: exchange.externalSubjectId,
        tokenHash: input.tokenHash,
        proofJkt: input.proofJkt,
        nonceHash: input.nonceHash,
        expiresAt: input.expiresAt,
      })
      .returning()
    return session
  })
}

export type EndUserSessionState = {
  session: EndUserSession
  environmentEnabled: boolean
  allowedBrowserOrigins: string[]
  subjectStatus: "provisioned" | "verified" | "disabled" | "erased"
}

export async function findEndUserSession(
  db: DbClient,
  tokenHash: string
): Promise<EndUserSessionState | undefined> {
  const [row] = await db
    .select({
      session: endUserSessions,
      environmentEnabled: environments.enabled,
      allowedBrowserOrigins: environments.allowedBrowserOrigins,
      subjectStatus: externalSubjects.status,
    })
    .from(endUserSessions)
    .innerJoin(
      environments,
      and(
        eq(environments.id, endUserSessions.environmentId),
        eq(environments.workspaceId, endUserSessions.workspaceId)
      )
    )
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, endUserSessions.externalSubjectId),
        eq(externalSubjects.workspaceId, endUserSessions.workspaceId)
      )
    )
    .where(eq(endUserSessions.tokenHash, tokenHash))
  return row
}

export async function recordEndUserSessionProof(
  db: DbClient,
  input: {
    sessionId: string
    jtiHash: string
    now: Date
  }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(endUserSessions)
      .where(
        and(
          eq(endUserSessions.id, input.sessionId),
          sql`EXISTS (
            SELECT 1 FROM ${environments}
            WHERE ${environments.id} = ${endUserSessions.environmentId}
              AND ${environments.workspaceId} = ${endUserSessions.workspaceId}
              AND ${environments.enabled} = true
          )`,
          sql`EXISTS (
            SELECT 1 FROM ${externalSubjects}
            WHERE ${externalSubjects.id} = ${endUserSessions.externalSubjectId}
              AND ${externalSubjects.workspaceId} = ${endUserSessions.workspaceId}
              AND ${externalSubjects.status} = 'verified'
          )`
        )
      )
      .for("update")
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= input.now.getTime()
    ) {
      return false
    }
    const inserted = await tx
      .insert(endUserSessionProofs)
      .values({
        sessionId: session.id,
        jtiHash: input.jtiHash,
        expiresAt: session.expiresAt,
      })
      .onConflictDoNothing()
      .returning({ jtiHash: endUserSessionProofs.jtiHash })
    if (inserted.length === 0) return false
    await tx
      .update(endUserSessions)
      .set({ lastUsedAt: input.now })
      .where(eq(endUserSessions.id, session.id))
    return true
  })
}

export async function revokeEndUserSession(
  db: DbClient,
  sessionId: string,
  now: Date
): Promise<void> {
  await db
    .update(endUserSessions)
    .set({ revokedAt: now })
    .where(
      and(eq(endUserSessions.id, sessionId), isNull(endUserSessions.revokedAt))
    )
}

export async function deleteExpiredEndUserSessions(
  db: DbClient,
  before: Date
): Promise<number> {
  const deleted = await db
    .delete(endUserSessions)
    .where(lt(endUserSessions.expiresAt, before))
    .returning({ id: endUserSessions.id })
  return deleted.length
}
