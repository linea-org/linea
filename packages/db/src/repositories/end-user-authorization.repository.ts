import { and, eq, gt, isNull, sql } from "drizzle-orm"
import {
  applications,
  auditLogs,
  endUserAuthorizationRequests,
  endUserIdentityExchanges,
  externalSubjectApplications,
  externalSubjects,
  type Application,
  type EndUserAuthorizationRequest,
  type EndUserIdentityExchange,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

type ApplicationIdentityConfiguration = Pick<
  Application,
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
      application: ApplicationIdentityConfiguration
    }
  | { outcome: "application_not_found" }
  | { outcome: "origin_denied" }

export async function createAuthorizationRequest(
  db: DbClient,
  input: {
    applicationId: string
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
      const [application] = await tx
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.id, input.applicationId),
            eq(applications.enabled, true)
          )
        )
        .for("share")
      if (!application) return { outcome: "application_not_found" }
      if (
        !application.allowedRedirectOrigins.includes(input.redirectOrigin) ||
        (input.browserOrigin !== undefined &&
          !application.allowedBrowserOrigins.includes(input.browserOrigin))
      ) {
        return { outcome: "origin_denied" }
      }
      const [request] = await tx
        .insert(endUserAuthorizationRequests)
        .values({
          workspaceId: application.workspaceId,
          applicationId: application.id,
          stateHash: input.stateHash,
          nonceHash: input.nonceHash,
          codeChallenge: input.codeChallenge,
          redirectUri: input.redirectUri,
          expiresAt: input.expiresAt,
        })
        .returning()
      return { outcome: "created", request, application }
    }
  )
}

export type ConsumeAuthorizationRequestResult =
  | {
      outcome: "consumed"
      request: EndUserAuthorizationRequest
      application: ApplicationIdentityConfiguration
    }
  | { outcome: "invalid" }

export async function consumeAuthorizationRequest(
  db: DbClient,
  input: {
    applicationId: string
    redirectUri: string
    browserOrigin: string | undefined
    stateHash: string
    codeChallenge: string
    authorizationCodeHash: string
    codeVerifierHash: string
    now: Date
  }
): Promise<ConsumeAuthorizationRequestResult> {
  return db.transaction(
    async (tx): Promise<ConsumeAuthorizationRequestResult> => {
      const [application] = await tx
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.id, input.applicationId),
            eq(applications.enabled, true)
          )
        )
        .for("share")
      if (!application) return { outcome: "invalid" }
      if (
        input.browserOrigin !== undefined &&
        !application.allowedBrowserOrigins.includes(input.browserOrigin)
      ) {
        return { outcome: "invalid" }
      }
      const [request] = await tx
        .update(endUserAuthorizationRequests)
        .set({
          authorizationCodeHash: input.authorizationCodeHash,
          codeVerifierHash: input.codeVerifierHash,
          consumedAt: input.now,
        })
        .where(
          and(
            eq(endUserAuthorizationRequests.applicationId, application.id),
            eq(endUserAuthorizationRequests.stateHash, input.stateHash),
            eq(endUserAuthorizationRequests.redirectUri, input.redirectUri),
            eq(endUserAuthorizationRequests.codeChallenge, input.codeChallenge),
            isNull(endUserAuthorizationRequests.consumedAt),
            gt(endUserAuthorizationRequests.expiresAt, input.now)
          )
        )
        .returning()
      if (!request) return { outcome: "invalid" }
      return { outcome: "consumed", request, application }
    }
  )
}

export type CompleteAuthorizationRequestResult =
  | {
      outcome: "completed"
      applicationId: string
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
    exchangeExpiresAt: Date
    now: Date
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
      if (!request?.consumedAt || request.completedAt) {
        return { outcome: "invalid" }
      }
      const [application] = await tx
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.id, request.applicationId),
            eq(applications.workspaceId, request.workspaceId),
            eq(applications.enabled, true)
          )
        )
        .for("share")
      if (!application) return { outcome: "invalid" }
      const [created] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: application.workspaceId,
          issuer: application.oidcIssuer,
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
                eq(externalSubjects.workspaceId, application.workspaceId),
                eq(externalSubjects.issuer, application.oidcIssuer),
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
        .insert(externalSubjectApplications)
        .values({
          workspaceId: application.workspaceId,
          applicationId: application.id,
          externalSubjectId: subject.id,
          metadata: {},
        })
        .onConflictDoNothing()
      const [exchange] = await tx
        .insert(endUserIdentityExchanges)
        .values({
          workspaceId: application.workspaceId,
          applicationId: application.id,
          externalSubjectId: subject.id,
          tokenHash: input.exchangeTokenHash,
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
          workspaceId: application.workspaceId,
          action: "external_subject.verified",
          resource: "external_subject",
          resourceId: subject.auditReference,
          metadata: { applicationId: application.id },
        })
      }
      return {
        outcome: "completed",
        applicationId: application.id,
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
          SELECT 1 FROM ${applications}
          WHERE ${applications.id} = ${endUserIdentityExchanges.applicationId}
            AND ${applications.workspaceId} = ${endUserIdentityExchanges.workspaceId}
            AND ${applications.enabled} = true
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
