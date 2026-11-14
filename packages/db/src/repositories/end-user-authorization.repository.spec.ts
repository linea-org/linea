import { createHash, randomUUID } from "node:crypto"
import { inArray } from "drizzle-orm"
import { db } from "../clients/index.js"
import { endUserAuthorizationRateLimits } from "../schema/index.js"
import { describe, expect, it } from "vitest"
import { applications, environments, organizations } from "../schema/index.js"
import {
  completeAuthorizationRequest,
  consumeAuthorizationRateLimits,
  consumeAuthorizationRequest,
  consumeRateLimits,
  consumeIdentityExchange,
  createAuthorizationRequest,
  deleteExpiredEndUserAuthorizationArtifacts,
  releaseAuthorizationRequestClaim,
} from "./end-user-authorization.repository.js"
import { withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function createWorkspace(tx: DbClient) {
  const suffix = randomUUID()
  const [workspace] = await tx
    .insert(organizations)
    .values({
      name: "Authorization Test",
      slug: `authorization-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  return workspace
}

async function createEnvironment(
  tx: DbClient,
  workspaceId: string,
  displayName: string
) {
  const [environment] = await tx
    .insert(environments)
    .values({
      applicationId: (
        await tx
          .insert(applications)
          .values({
            workspaceId,
            name: "Test product",
            slug: crypto.randomUUID(),
          })
          .returning()
      )[0].id,
      workspaceId,
      environment: "production",
      displayName,
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: `${displayName}-client`,
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  return environment
}

function authorizationInput(environmentId: string, suffix: string) {
  return {
    environmentId,
    redirectUri: "https://app.example.com/callback",
    redirectOrigin: "https://app.example.com",
    browserOrigin: "https://app.example.com",
    stateHash: hash(`state-${suffix}`),
    nonceHash: hash(`nonce-${suffix}`),
    codeChallenge: `challenge-${suffix}`,
    expiresAt: new Date(Date.now() + 60_000),
  }
}

describe("end-user authorization repository", () => {
  it("binds requests to one Environment, origin, redirect, verifier, and use", async () => {
    await withRollback(async (tx) => {
      const workspace = await createWorkspace(tx)
      const environment = await createEnvironment(tx, workspace.id, "portal")
      const otherEnvironment = await createEnvironment(
        tx,
        workspace.id,
        "other-portal"
      )
      const created = await createAuthorizationRequest(
        tx,
        authorizationInput(environment.id, "valid")
      )
      expect(created.outcome).toBe("created")
      expect(
        await createAuthorizationRequest(tx, {
          ...authorizationInput(environment.id, "wrong-origin"),
          browserOrigin: "https://attacker.example.com",
        })
      ).toEqual({ outcome: "origin_denied" })
      expect(
        await createAuthorizationRequest(tx, {
          ...authorizationInput(environment.id, "wrong-redirect-origin"),
          redirectUri: "https://attacker.example.com/callback",
          redirectOrigin: "https://attacker.example.com",
        })
      ).toEqual({ outcome: "origin_denied" })
      expect(
        await consumeAuthorizationRequest(tx, {
          environmentId: otherEnvironment.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("code-wrong-environment"),
          codeVerifierHash: hash("verifier"),
          now: new Date(),
          claimExpiredBefore: new Date(0),
        })
      ).toEqual({ outcome: "invalid" })
      expect(
        await consumeAuthorizationRequest(tx, {
          environmentId: environment.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "wrong-challenge",
          authorizationCodeHash: hash("code-wrong-verifier"),
          codeVerifierHash: hash("wrong-verifier"),
          now: new Date(),
          claimExpiredBefore: new Date(0),
        })
      ).toEqual({ outcome: "invalid" })
      expect(
        await consumeAuthorizationRequest(tx, {
          environmentId: environment.id,
          redirectUri: "https://attacker.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("code-wrong-redirect"),
          codeVerifierHash: hash("verifier"),
          now: new Date(),
          claimExpiredBefore: new Date(0),
        })
      ).toEqual({ outcome: "invalid" })
      const claimedAt = new Date()
      const consumed = await consumeAuthorizationRequest(tx, {
        environmentId: environment.id,
        redirectUri: "https://app.example.com/callback",
        browserOrigin: "https://app.example.com",
        stateHash: hash("state-valid"),
        codeChallenge: "challenge-valid",
        authorizationCodeHash: hash("authorization-code"),
        codeVerifierHash: hash("verifier"),
        now: claimedAt,
        claimExpiredBefore: new Date(0),
      })
      expect(consumed.outcome).toBe("consumed")
      expect(
        await consumeAuthorizationRequest(tx, {
          environmentId: environment.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("replay-code"),
          codeVerifierHash: hash("verifier"),
          now: new Date(),
          claimExpiredBefore: new Date(0),
        })
      ).toEqual({ outcome: "invalid" })
      if (consumed.outcome !== "consumed")
        throw new Error("Request not claimed")
      await releaseAuthorizationRequestClaim(tx, consumed.request.id, claimedAt)
      expect(
        await consumeAuthorizationRequest(tx, {
          environmentId: environment.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("authorization-code"),
          codeVerifierHash: hash("other-verifier"),
          now: new Date(),
          claimExpiredBefore: new Date(0),
        })
      ).toEqual({ outcome: "invalid" })
      expect(
        await consumeAuthorizationRequest(tx, {
          environmentId: environment.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("authorization-code"),
          codeVerifierHash: hash("verifier"),
          now: new Date(),
          claimExpiredBefore: new Date(0),
        })
      ).toMatchObject({ outcome: "consumed" })
      const expired = authorizationInput(environment.id, "expired")
      await createAuthorizationRequest(tx, {
        ...expired,
        expiresAt: new Date(Date.now() - 1),
      })
      expect(
        await consumeAuthorizationRequest(tx, {
          environmentId: environment.id,
          redirectUri: expired.redirectUri,
          browserOrigin: expired.browserOrigin,
          stateHash: expired.stateHash,
          codeChallenge: expired.codeChallenge,
          authorizationCodeHash: hash("expired-code"),
          codeVerifierHash: hash("expired-verifier"),
          now: new Date(),
          claimExpiredBefore: new Date(0),
        })
      ).toEqual({ outcome: "invalid" })
    })
  })
  it("resolves verified identities per workspace and issues one-use exchanges", async () => {
    await withRollback(async (tx) => {
      const firstWorkspace = await createWorkspace(tx)
      const secondWorkspace = await createWorkspace(tx)
      const firstEnvironment = await createEnvironment(
        tx,
        firstWorkspace.id,
        "first"
      )
      const secondEnvironment = await createEnvironment(
        tx,
        secondWorkspace.id,
        "second"
      )
      const environmentsToAuthorize = [firstEnvironment, secondEnvironment]
      const subjectIds: string[] = []
      for (const [index, environment] of environmentsToAuthorize.entries()) {
        const suffix = `workspace-${index}`
        const created = await createAuthorizationRequest(
          tx,
          authorizationInput(environment.id, suffix)
        )
        if (created.outcome !== "created")
          throw new Error("Request not created")
        const claimedAt = new Date()
        const consumed = await consumeAuthorizationRequest(tx, {
          environmentId: environment.id,
          redirectUri: created.request.redirectUri,
          browserOrigin: "https://app.example.com",
          stateHash: created.request.stateHash,
          codeChallenge: created.request.codeChallenge,
          authorizationCodeHash: hash(`code-${suffix}`),
          codeVerifierHash: hash(`verifier-${suffix}`),
          now: claimedAt,
          claimExpiredBefore: new Date(0),
        })
        if (consumed.outcome !== "consumed")
          throw new Error("Request not consumed")
        const completed = await completeAuthorizationRequest(tx, {
          authorizationRequestId: consumed.request.id,
          issuerSubject: "same-provider-subject",
          exchangeTokenHash: hash(`exchange-${suffix}`),
          dpopNonceHash: hash(`nonce-${suffix}`),
          exchangeExpiresAt: new Date(Date.now() + 60_000),
          now: new Date(),
          claimedAt,
        })
        if (completed.outcome !== "completed")
          throw new Error("Request not completed")
        subjectIds.push(completed.externalSubjectId)
      }
      expect(new Set(subjectIds).size).toBe(2)
      const firstTokenHash = hash("exchange-workspace-0")
      expect(
        await consumeIdentityExchange(tx, firstTokenHash, new Date())
      ).toMatchObject({
        environmentId: firstEnvironment.id,
        externalSubjectId: subjectIds[0],
      })
      expect(
        await consumeIdentityExchange(tx, firstTokenHash, new Date())
      ).toBeUndefined()
      expect(
        await consumeIdentityExchange(
          tx,
          hash("exchange-workspace-1"),
          new Date(Date.now() + 120_000)
        )
      ).toBeUndefined()
    })
  })
  it("enforces shared rate limits and deletes expired artifacts", async () => {
    await withRollback(async (tx) => {
      const expiresAt = new Date(Date.now() + 60_000)
      const limits = [
        { key: `ip-${randomUUID()}`, limit: 2 },
        { key: `environment-${randomUUID()}`, limit: 2 },
      ]
      await expect(
        consumeAuthorizationRateLimits(tx, limits, expiresAt)
      ).resolves.toBe(true)
      await expect(
        consumeAuthorizationRateLimits(tx, limits, expiresAt)
      ).resolves.toBe(true)
      await expect(
        consumeAuthorizationRateLimits(tx, limits, expiresAt)
      ).resolves.toBe(false)
      await expect(
        deleteExpiredEndUserAuthorizationArtifacts(
          tx,
          new Date(expiresAt.getTime() + 1)
        )
      ).resolves.toBe(2)
    })
  })
  it("reports which budget refused a request", async () => {
    await withRollback(async (tx) => {
      const expiresAt = new Date(Date.now() + 60_000)
      const actor = { key: `actor-${randomUUID()}`, limit: 2 }
      const workspace = { key: `workspace-${randomUUID()}`, limit: 3 }
      const sibling = { key: `sibling-${randomUUID()}`, limit: 2 }
      expect(
        await consumeRateLimits(tx, [actor, workspace], expiresAt)
      ).toEqual([])
      expect(
        await consumeRateLimits(tx, [actor, workspace], expiresAt)
      ).toEqual([])
      expect(
        await consumeRateLimits(tx, [actor, workspace], expiresAt)
      ).toEqual([actor.key])
      expect(
        await consumeRateLimits(tx, [sibling, workspace], expiresAt)
      ).toEqual([])
      expect(
        await consumeRateLimits(tx, [sibling, workspace], expiresAt)
      ).toEqual([workspace.key])
    })
  })
  it("does not charge any quota when another dimension refuses", async () => {
    await withRollback(async (tx) => {
      const expiresAt = new Date(Date.now() + 60_000)
      const ip = { key: `a-ip-${randomUUID()}`, limit: 1 }
      const environment = { key: `b-environment-${randomUUID()}`, limit: 3 }
      const victim = { key: `c-victim-${randomUUID()}`, limit: 3 }
      expect(
        await consumeAuthorizationRateLimits(tx, [ip, environment], expiresAt)
      ).toBe(true)
      for (let index = 0; index < 5; index++) {
        expect(
          await consumeAuthorizationRateLimits(tx, [ip, environment], expiresAt)
        ).toBe(false)
      }
      expect(
        await consumeAuthorizationRateLimits(
          tx,
          [victim, environment],
          expiresAt
        )
      ).toBe(true)
      expect(
        await consumeAuthorizationRateLimits(
          tx,
          [victim, environment],
          expiresAt
        )
      ).toBe(true)
      expect(
        await consumeAuthorizationRateLimits(
          tx,
          [victim, environment],
          expiresAt
        )
      ).toBe(false)
      const rows = await tx
        .select()
        .from(endUserAuthorizationRateLimits)
        .where(
          inArray(endUserAuthorizationRateLimits.key, [
            ip.key,
            environment.key,
            victim.key,
          ])
        )
      expect(new Map(rows.map((row) => [row.key, row.requestCount]))).toEqual(
        new Map([
          [ip.key, 1],
          [environment.key, 3],
          [victim.key, 2],
        ])
      )
    })
  })
  it("admits exactly the shared ceiling across independent concurrent transactions", async () => {
    const expiresAt = new Date(Date.now() + 60_000)
    const shared = { key: `shared-${randomUUID()}`, limit: 7 }
    const secondShared = { key: `other-shared-${randomUUID()}`, limit: 7 }
    const clients = Array.from({ length: 24 }, () => ({
      key: `client-${randomUUID()}`,
      limit: 1,
    }))
    const keys = [
      shared.key,
      secondShared.key,
      ...clients.map(({ key }) => key),
    ]
    try {
      const results = await Promise.all(
        clients.map((client, index) =>
          consumeAuthorizationRateLimits(
            db,
            index % 2
              ? [client, shared, secondShared]
              : [secondShared, shared, client],
            expiresAt
          )
        )
      )
      expect(results.filter(Boolean)).toHaveLength(7)
      const rows = await db
        .select()
        .from(endUserAuthorizationRateLimits)
        .where(inArray(endUserAuthorizationRateLimits.key, keys))
      expect(rows.find(({ key }) => key === shared.key)?.requestCount).toBe(7)
      expect(
        rows.find(({ key }) => key === secondShared.key)?.requestCount
      ).toBe(7)
      expect(
        rows.filter(({ key }) => key !== shared.key && key !== secondShared.key)
      ).toHaveLength(7)
    } finally {
      await db
        .delete(endUserAuthorizationRateLimits)
        .where(inArray(endUserAuthorizationRateLimits.key, keys))
    }
  })
})
