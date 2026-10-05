import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm"
import {
  environments,
  auditLogs,
  endUserAuthorizationRateLimits,
  endUserAuthorizationRequests,
  endUserIdentityExchanges,
  externalSubjectEnvironments,
  externalSubjects,
  type Environment,
  type EndUserAuthorizationRequest,
  type EndUserIdentityExchange,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

type EnvironmentIdentityConfiguration = Pick<
  Environment,
  | "id"
  | "workspaceId"
  | "environment"
  | "oidcIssuer"
  | "oidcClientId"
  | "oidcAudience"
  | "oidcJwksUrl"
  | "oidcSubjectClaim"
>

export type CreateAuthorizationRequestResult =
  | {
      outcome: "created"
      request: EndUserAuthorizationRequest
      environment: EnvironmentIdentityConfiguration
    }
  | { outcome: "environment_not_found" }
  | { outcome: "origin_denied" }

export async function createAuthorizationRequest(
  db: DbClient,
  input: {
    environmentId: string
    redirectUri: string
    redirectOrigin: string
    browserOrigin: string | undefined
    stateHash: string
    nonceHash: string
    codeChallenge: string
    expiresAt: Date
  }
): Promise<CreateAuthorizationRequestResult> {
  return db.transaction(
    async (tx): Promise<CreateAuthorizationRequestResult> => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.id, input.environmentId),
            eq(environments.enabled, true)
          )
        )
        .for("share")
      if (!environment || !environment.oidcIssuer)
        return { outcome: "environment_not_found" }
      if (
        !environment.allowedRedirectOrigins.includes(input.redirectOrigin) ||
        (input.browserOrigin !== undefined &&
          !environment.allowedBrowserOrigins.includes(input.browserOrigin))
      ) {
        return { outcome: "origin_denied" }
      }
      const [request] = await tx
        .insert(endUserAuthorizationRequests)
        .values({
          workspaceId: environment.workspaceId,
          environmentId: environment.id,
          stateHash: input.stateHash,
          nonceHash: input.nonceHash,
          codeChallenge: input.codeChallenge,
          redirectUri: input.redirectUri,
          expiresAt: input.expiresAt,
        })
        .returning()
      return { outcome: "created", request, environment }
    }
  )
}

export type ConsumeAuthorizationRequestResult =
  | {
      outcome: "consumed"
      request: EndUserAuthorizationRequest
      environment: EnvironmentIdentityConfiguration
    }
  | { outcome: "invalid" }

export async function consumeAuthorizationRequest(
  db: DbClient,
  input: {
    environmentId: string
    redirectUri: string
    browserOrigin: string | undefined
    stateHash: string
    codeChallenge: string
    authorizationCodeHash: string
    codeVerifierHash: string
    now: Date
    claimExpiredBefore: Date
  }
): Promise<ConsumeAuthorizationRequestResult> {
  return db.transaction(
    async (tx): Promise<ConsumeAuthorizationRequestResult> => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.id, input.environmentId),
            eq(environments.enabled, true)
          )
        )
        .for("share")
      if (!environment || !environment.oidcIssuer) return { outcome: "invalid" }
      if (
        input.browserOrigin !== undefined &&
        !environment.allowedBrowserOrigins.includes(input.browserOrigin)
      ) {
        return { outcome: "invalid" }
      }
      const [request] = await tx
        .update(endUserAuthorizationRequests)
        .set({
          authorizationCodeHash: input.authorizationCodeHash,
          codeVerifierHash: input.codeVerifierHash,
          claimedAt: input.now,
        })
        .where(
          and(
            eq(endUserAuthorizationRequests.environmentId, environment.id),
            eq(endUserAuthorizationRequests.stateHash, input.stateHash),
            eq(endUserAuthorizationRequests.redirectUri, input.redirectUri),
            eq(endUserAuthorizationRequests.codeChallenge, input.codeChallenge),
            isNull(endUserAuthorizationRequests.completedAt),
            gt(endUserAuthorizationRequests.expiresAt, input.now),
            or(
              and(
                isNull(endUserAuthorizationRequests.authorizationCodeHash),
                isNull(endUserAuthorizationRequests.codeVerifierHash),
                isNull(endUserAuthorizationRequests.claimedAt)
              ),
              and(
                eq(
                  endUserAuthorizationRequests.authorizationCodeHash,
                  input.authorizationCodeHash
                ),
                eq(
                  endUserAuthorizationRequests.codeVerifierHash,
                  input.codeVerifierHash
                ),
                or(
                  isNull(endUserAuthorizationRequests.claimedAt),
                  lt(
                    endUserAuthorizationRequests.claimedAt,
                    input.claimExpiredBefore
                  )
                )
              )
            )
          )
        )
        .returning()
      if (!request) return { outcome: "invalid" }
      return { outcome: "consumed", request, environment }
    }
  )
}

export async function releaseAuthorizationRequestClaim(
  db: DbClient,
  authorizationRequestId: string,
  claimedAt: Date
): Promise<void> {
  await db
    .update(endUserAuthorizationRequests)
    .set({ claimedAt: null })
    .where(
      and(
        eq(endUserAuthorizationRequests.id, authorizationRequestId),
        eq(endUserAuthorizationRequests.claimedAt, claimedAt),
        isNull(endUserAuthorizationRequests.completedAt)
      )
    )
}

export type CompleteAuthorizationRequestResult =
  | {
      outcome: "completed"
      environmentId: string
      externalSubjectId: string
      exchange: EndUserIdentityExchange
    }
  | { outcome: "invalid" }
  | { outcome: "external_subject_disabled" }

export async function completeAuthorizationRequest(
  db: DbClient,
  input: {
    authorizationRequestId: string
    issuerSubject: string
    exchangeTokenHash: string
    dpopNonceHash: string
    exchangeExpiresAt: Date
    now: Date
    claimedAt: Date
  }
): Promise<CompleteAuthorizationRequestResult> {
  return db.transaction(
    async (tx): Promise<CompleteAuthorizationRequestResult> => {
      const [request] = await tx
        .select()
        .from(endUserAuthorizationRequests)
        .where(
          eq(endUserAuthorizationRequests.id, input.authorizationRequestId)
        )
        .for("update")
      if (
        !request?.claimedAt ||
        request.claimedAt.getTime() !== input.claimedAt.getTime() ||
        request.completedAt
      ) {
        return { outcome: "invalid" }
      }
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.id, request.environmentId),
            eq(environments.workspaceId, request.workspaceId),
            eq(environments.enabled, true)
          )
        )
        .for("share")
      if (!environment || !environment.oidcIssuer) return { outcome: "invalid" }
      const [created] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: environment.workspaceId,
          issuer: environment.oidcIssuer,
          issuerSubject: input.issuerSubject,
          status: "verified",
          verifiedAt: input.now,
        })
        .onConflictDoNothing({
          target: [
            externalSubjects.workspaceId,
            externalSubjects.issuer,
            externalSubjects.issuerSubject,
          ],
        })
        .returning()
      const subject =
        created ??
        (
          await tx
            .select()
            .from(externalSubjects)
            .where(
              and(
                eq(externalSubjects.workspaceId, environment.workspaceId),
                eq(externalSubjects.issuer, environment.oidcIssuer),
                eq(externalSubjects.issuerSubject, input.issuerSubject)
              )
            )
            .for("update")
        )[0]
      if (!subject) throw new Error("Verified External Subject disappeared")
      if (subject.status === "disabled") {
        return { outcome: "external_subject_disabled" }
      }
      if (subject.status === "provisioned") {
        await tx
          .update(externalSubjects)
          .set({
            status: "verified",
            verifiedAt: input.now,
            updatedAt: input.now,
          })
          .where(eq(externalSubjects.id, subject.id))
      }
      await tx
        .insert(externalSubjectEnvironments)
        .values({
          workspaceId: environment.workspaceId,
          environmentId: environment.id,
          externalSubjectId: subject.id,
          metadata: {},
        })
        .onConflictDoNothing()
      const [exchange] = await tx
        .insert(endUserIdentityExchanges)
        .values({
          workspaceId: environment.workspaceId,
          environmentId: environment.id,
          externalSubjectId: subject.id,
          tokenHash: input.exchangeTokenHash,
          dpopNonceHash: input.dpopNonceHash,
          expiresAt: input.exchangeExpiresAt,
        })
        .returning()
      await tx
        .update(endUserAuthorizationRequests)
        .set({
          externalSubjectId: subject.id,
          completedAt: input.now,
        })
        .where(eq(endUserAuthorizationRequests.id, request.id))
      if (created || subject.status === "provisioned") {
        await tx.insert(auditLogs).values({
          workspaceId: environment.workspaceId,
          action: "external_subject.verified",
          resource: "external_subject",
          resourceId: subject.auditReference,
          metadata: { environmentId: environment.id },
        })
      }
      return {
        outcome: "completed",
        environmentId: environment.id,
        externalSubjectId: subject.id,
        exchange,
      }
    }
  )
}

export async function consumeIdentityExchange(
  db: DbClient,
  tokenHash: string,
  now: Date
): Promise<EndUserIdentityExchange | undefined> {
  const [exchange] = await db
    .update(endUserIdentityExchanges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(endUserIdentityExchanges.tokenHash, tokenHash),
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
    .returning()
  return exchange
}

export async function consumeAuthorizationRateLimits(
  db: DbClient,
  limits: { key: string; limit: number }[],
  expiresAt: Date
): Promise<boolean> {
  const applied = await db
    .insert(endUserAuthorizationRateLimits)
    .values(limits.map(({ key }) => ({ key, expiresAt })))
    .onConflictDoUpdate({
      target: endUserAuthorizationRateLimits.key,
      set: {
        requestCount: sql`${endUserAuthorizationRateLimits.requestCount} + 1`,
      },
    })
    .returning({
      key: endUserAuthorizationRateLimits.key,
      requestCount: endUserAuthorizationRateLimits.requestCount,
    })
  const limitsByKey = new Map(limits.map(({ key, limit }) => [key, limit]))
  if (applied.length !== limits.length) {
    throw new Error("Authorization rate limits were not applied atomically")
  }
  return applied.every(
    ({ key, requestCount }) => requestCount <= (limitsByKey.get(key) ?? 0)
  )
}

export async function deleteExpiredEndUserAuthorizationArtifacts(
  db: DbClient,
  before: Date
): Promise<number> {
  return db.transaction(async (tx) => {
    const exchanges = await tx
      .delete(endUserIdentityExchanges)
      .where(lt(endUserIdentityExchanges.expiresAt, before))
      .returning({ id: endUserIdentityExchanges.id })
    const requests = await tx
      .delete(endUserAuthorizationRequests)
      .where(lt(endUserAuthorizationRequests.expiresAt, before))
      .returning({ id: endUserAuthorizationRequests.id })
    const rateLimits = await tx
      .delete(endUserAuthorizationRateLimits)
      .where(lt(endUserAuthorizationRateLimits.expiresAt, before))
      .returning({ key: endUserAuthorizationRateLimits.key })
    return exchanges.length + requests.length + rateLimits.length
  })
}
