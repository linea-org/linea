import { createHash, randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { applications, organizations } from "../schema/index.js"
import {
  completeAuthorizationRequest,
  consumeAuthorizationRequest,
  consumeIdentityExchange,
  createAuthorizationRequest,
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

async function createApplication(
  tx: DbClient,
  workspaceId: string,
  displayName: string
) {
  const [application] = await tx
    .insert(applications)
    .values({
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
  return application
}

function authorizationInput(applicationId: string, suffix: string) {
  return {
    applicationId,
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
  it("binds requests to one Application, origin, redirect, verifier, and use", async () => {
    await withRollback(async (tx) => {
      const workspace = await createWorkspace(tx)
      const application = await createApplication(tx, workspace.id, "portal")
      const otherApplication = await createApplication(
        tx,
        workspace.id,
        "other-portal"
      )
      const created = await createAuthorizationRequest(
        tx,
        authorizationInput(application.id, "valid")
      )
      expect(created.outcome).toBe("created")
      expect(
        await createAuthorizationRequest(tx, {
          ...authorizationInput(application.id, "wrong-origin"),
          browserOrigin: "https://attacker.example.com",
        })
      ).toEqual({ outcome: "origin_denied" })
      expect(
        await createAuthorizationRequest(tx, {
          ...authorizationInput(application.id, "wrong-redirect-origin"),
          redirectUri: "https://attacker.example.com/callback",
          redirectOrigin: "https://attacker.example.com",
        })
      ).toEqual({ outcome: "origin_denied" })
      expect(
        await consumeAuthorizationRequest(tx, {
          applicationId: otherApplication.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("code-wrong-application"),
          codeVerifierHash: hash("verifier"),
          now: new Date(),
        })
      ).toEqual({ outcome: "invalid" })
      expect(
        await consumeAuthorizationRequest(tx, {
          applicationId: application.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "wrong-challenge",
          authorizationCodeHash: hash("code-wrong-verifier"),
          codeVerifierHash: hash("wrong-verifier"),
          now: new Date(),
        })
      ).toEqual({ outcome: "invalid" })
      expect(
        await consumeAuthorizationRequest(tx, {
          applicationId: application.id,
          redirectUri: "https://attacker.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("code-wrong-redirect"),
          codeVerifierHash: hash("verifier"),
          now: new Date(),
        })
      ).toEqual({ outcome: "invalid" })
      const consumed = await consumeAuthorizationRequest(tx, {
        applicationId: application.id,
        redirectUri: "https://app.example.com/callback",
        browserOrigin: "https://app.example.com",
        stateHash: hash("state-valid"),
        codeChallenge: "challenge-valid",
        authorizationCodeHash: hash("authorization-code"),
        codeVerifierHash: hash("verifier"),
        now: new Date(),
      })
      expect(consumed.outcome).toBe("consumed")
      expect(
        await consumeAuthorizationRequest(tx, {
          applicationId: application.id,
          redirectUri: "https://app.example.com/callback",
          browserOrigin: "https://app.example.com",
          stateHash: hash("state-valid"),
          codeChallenge: "challenge-valid",
          authorizationCodeHash: hash("replay-code"),
          codeVerifierHash: hash("verifier"),
          now: new Date(),
        })
      ).toEqual({ outcome: "invalid" })
      const expired = authorizationInput(application.id, "expired")
      await createAuthorizationRequest(tx, {
        ...expired,
        expiresAt: new Date(Date.now() - 1),
      })
      expect(
        await consumeAuthorizationRequest(tx, {
          applicationId: application.id,
          redirectUri: expired.redirectUri,
          browserOrigin: expired.browserOrigin,
          stateHash: expired.stateHash,
          codeChallenge: expired.codeChallenge,
          authorizationCodeHash: hash("expired-code"),
          codeVerifierHash: hash("expired-verifier"),
          now: new Date(),
        })
      ).toEqual({ outcome: "invalid" })
    })
  })

  it("resolves verified identities per workspace and issues one-use exchanges", async () => {
    await withRollback(async (tx) => {
      const firstWorkspace = await createWorkspace(tx)
      const secondWorkspace = await createWorkspace(tx)
      const firstApplication = await createApplication(
        tx,
        firstWorkspace.id,
        "first"
      )
      const secondApplication = await createApplication(
        tx,
        secondWorkspace.id,
        "second"
      )
      const applicationsToAuthorize = [firstApplication, secondApplication]
      const subjectIds: string[] = []
      for (const [index, application] of applicationsToAuthorize.entries()) {
        const suffix = `workspace-${index}`
        const created = await createAuthorizationRequest(
          tx,
          authorizationInput(application.id, suffix)
        )
        if (created.outcome !== "created")
          throw new Error("Request not created")
        const consumed = await consumeAuthorizationRequest(tx, {
          applicationId: application.id,
          redirectUri: created.request.redirectUri,
          browserOrigin: "https://app.example.com",
          stateHash: created.request.stateHash,
          codeChallenge: created.request.codeChallenge,
          authorizationCodeHash: hash(`code-${suffix}`),
          codeVerifierHash: hash(`verifier-${suffix}`),
          now: new Date(),
        })
        if (consumed.outcome !== "consumed")
          throw new Error("Request not consumed")
        const completed = await completeAuthorizationRequest(tx, {
          authorizationRequestId: consumed.request.id,
          issuerSubject: "same-provider-subject",
          exchangeTokenHash: hash(`exchange-${suffix}`),
          exchangeExpiresAt: new Date(Date.now() + 60_000),
          now: new Date(),
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
        applicationId: firstApplication.id,
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
})
