import { createHash, randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  applications,
  endUserIdentityExchanges,
  externalSubjects,
  organizations,
} from "../schema/index.js"
import {
  createEndUserSession,
  findEndUserSession,
  findIdentityExchange,
  recordEndUserSessionProof,
  revokeEndUserSession,
} from "./end-user-session.repository.js"
import { withRollback } from "./test-utils.js"

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

describe("end-user session repository", () => {
  it("consumes one identity exchange and rejects proof replay and revocation", async () => {
    await withRollback(async (tx) => {
      const suffix = randomUUID()
      const [workspace] = await tx
        .insert(organizations)
        .values({
          name: "Session Test",
          slug: `session-${suffix}`,
          createdAt: new Date(),
        })
        .returning()
      const [application] = await tx
        .insert(applications)
        .values({
          workspaceId: workspace.id,
          environment: "production",
          displayName: "Portal",
          allowedBrowserOrigins: ["https://app.example.com"],
          allowedRedirectOrigins: ["https://app.example.com"],
          oidcIssuer: "https://identity.example.com",
          oidcClientId: "portal",
          oidcAudience: "linea",
          oidcJwksUrl: "https://identity.example.com/jwks.json",
        })
        .returning()
      const [subject] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: workspace.id,
          issuer: application.oidcIssuer,
          issuerSubject: "customer-123",
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      const exchangeTokenHash = hash("exchange-token")
      const [exchange] = await tx
        .insert(endUserIdentityExchanges)
        .values({
          workspaceId: workspace.id,
          applicationId: application.id,
          externalSubjectId: subject.id,
          tokenHash: exchangeTokenHash,
          dpopNonceHash: hash("exchange-nonce"),
          expiresAt: new Date(Date.now() + 60_000),
        })
        .returning()
      await expect(
        findIdentityExchange(tx, exchangeTokenHash, new Date())
      ).resolves.toMatchObject({
        exchange: { id: exchange.id },
        allowedBrowserOrigins: ["https://app.example.com"],
      })
      const now = new Date()
      const input = {
        exchangeId: exchange.id,
        exchangeTokenHash,
        workspaceId: workspace.id,
        applicationId: application.id,
        externalSubjectId: subject.id,
        tokenHash: hash("access-token"),
        proofJkt: "proof-thumbprint",
        nonceHash: hash("session-nonce"),
        expiresAt: new Date(now.getTime() + 60_000),
        now,
      }
      const session = await createEndUserSession(tx, input)
      expect(session).toMatchObject({
        applicationId: application.id,
        externalSubjectId: subject.id,
      })
      await expect(createEndUserSession(tx, input)).resolves.toBeUndefined()
      if (!session) throw new Error("Session not created")
      await expect(
        findEndUserSession(tx, input.tokenHash)
      ).resolves.toMatchObject({
        session: { id: session.id },
        applicationEnabled: true,
        subjectStatus: "verified",
      })
      const proof = {
        sessionId: session.id,
        jtiHash: hash("proof-id"),
        now: new Date(),
      }
      await expect(recordEndUserSessionProof(tx, proof)).resolves.toBe(true)
      await expect(recordEndUserSessionProof(tx, proof)).resolves.toBe(false)
      await revokeEndUserSession(tx, session.id, new Date())
      await expect(
        recordEndUserSessionProof(tx, {
          ...proof,
          jtiHash: hash("new-proof-id"),
        })
      ).resolves.toBe(false)
    })
  })
})
