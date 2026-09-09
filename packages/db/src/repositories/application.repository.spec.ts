import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { auditLogs, users } from "../schema/index.js"
import {
  createApplication,
  disableApplication,
  getApplicationById,
  isApplicationBrowserOriginAllowed,
  listApplications,
  replaceApplicationTrustConfiguration,
  updateApplicationProfile,
  type CreateApplicationInput,
} from "./application.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

function applicationInput(workspaceId: string): CreateApplicationInput {
  return {
    workspaceId,
    environment: "production",
    displayName: "Customer portal",
    logoUrl: null,
    allowedBrowserOrigins: ["https://app.example.com"],
    allowedRedirectOrigins: ["https://app.example.com", "example-app://"],
    contentRetentionDays: 30,
    oidcIssuer: "https://identity.example.com",
    oidcClientId: "customer-portal",
    oidcAudience: "linea",
    oidcJwksUrl: "https://identity.example.com/.well-known/jwks.json",
    oidcSubjectClaim: "sub",
  }
}

describe("application repository", () => {
  it("persists the deployed boundary and a redacted creation audit", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const [actor] = await tx
        .insert(users)
        .values({ name: "Admin", email: `admin-${organization.id}@test.dev` })
        .returning()
      const created = await createApplication(
        tx,
        applicationInput(organization.id),
        { userId: actor.id }
      )
      expect(created.environment).toBe("production")
      expect(created.enabled).toBe(true)
      expect(created.contentRetentionDays).toBe(30)
      const [audit] = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, created.id))
      expect(audit).toMatchObject({
        workspaceId: organization.id,
        actorUserId: actor.id,
        action: "application.created",
        resource: "application",
        metadata: { environment: "production" },
      })
      expect(JSON.stringify(audit?.metadata)).not.toContain(
        created.oidcClientId
      )
    })
  })
  it("scopes reads and writes to the owning workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherWorkspace } = await createTestFixtures(tx)
      const [actor] = await tx
        .insert(users)
        .values({ name: "Admin", email: `admin-${organization.id}@test.dev` })
        .returning()
      const application = await createApplication(
        tx,
        applicationInput(organization.id),
        { userId: actor.id }
      )
      const otherActor = { userId: actor.id }
      expect(
        await getApplicationById(tx, otherWorkspace.id, application.id)
      ).toBeUndefined()
      expect(await listApplications(tx, otherWorkspace.id)).toEqual([])
      expect(
        await updateApplicationProfile(
          tx,
          otherWorkspace.id,
          application.id,
          { displayName: "Stolen" },
          otherActor
        )
      ).toBeUndefined()
      expect(
        await replaceApplicationTrustConfiguration(
          tx,
          otherWorkspace.id,
          application.id,
          {
            allowedBrowserOrigins: ["https://attacker.example.com"],
            allowedRedirectOrigins: ["https://attacker.example.com"],
            oidcIssuer: "https://attacker.example.com",
            oidcClientId: "attacker",
            oidcAudience: "attacker",
            oidcJwksUrl: "https://attacker.example.com/jwks.json",
            oidcSubjectClaim: "sub",
          },
          otherActor
        )
      ).toBeUndefined()
      expect(
        await disableApplication(
          tx,
          otherWorkspace.id,
          application.id,
          otherActor
        )
      ).toBeUndefined()
      expect(
        await getApplicationById(tx, organization.id, application.id)
      ).toMatchObject({ displayName: "Customer portal", enabled: true })
    })
  })
  it("validates allowed origins inside the workspace and enabled state", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherWorkspace } = await createTestFixtures(tx)
      const [actor] = await tx
        .insert(users)
        .values({ name: "Admin", email: `admin-${organization.id}@test.dev` })
        .returning()
      const application = await createApplication(
        tx,
        applicationInput(organization.id),
        { userId: actor.id }
      )
      expect(
        await isApplicationBrowserOriginAllowed(
          tx,
          organization.id,
          application.id,
          "https://app.example.com"
        )
      ).toBe(true)
      expect(
        await isApplicationBrowserOriginAllowed(
          tx,
          organization.id,
          application.id,
          "https://other.example.com"
        )
      ).toBe(false)
      expect(
        await isApplicationBrowserOriginAllowed(
          tx,
          otherWorkspace.id,
          application.id,
          "https://app.example.com"
        )
      ).toBe(false)
      await disableApplication(tx, organization.id, application.id, {
        userId: actor.id,
      })
      expect(
        await isApplicationBrowserOriginAllowed(
          tx,
          organization.id,
          application.id,
          "https://app.example.com"
        )
      ).toBe(false)
    })
  })
  it("audits profile, trust, and disable changes without their values", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const [actor] = await tx
        .insert(users)
        .values({ name: "Admin", email: `admin-${organization.id}@test.dev` })
        .returning()
      const application = await createApplication(
        tx,
        applicationInput(organization.id),
        { userId: actor.id }
      )
      await updateApplicationProfile(
        tx,
        organization.id,
        application.id,
        { displayName: "Renamed portal", contentRetentionDays: 60 },
        { userId: actor.id }
      )
      await replaceApplicationTrustConfiguration(
        tx,
        organization.id,
        application.id,
        {
          allowedBrowserOrigins: ["https://new.example.com"],
          allowedRedirectOrigins: ["https://new.example.com"],
          oidcIssuer: "https://new-identity.example.com",
          oidcClientId: "new-sensitive-client-id",
          oidcAudience: "new-audience",
          oidcJwksUrl: "https://new-identity.example.com/jwks.json",
          oidcSubjectClaim: "subject",
        },
        { userId: actor.id }
      )
      await disableApplication(tx, organization.id, application.id, {
        userId: actor.id,
      })
      const audits = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, application.id))
      expect(audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining([
          "application.created",
          "application.updated",
          "application.trust_configuration_updated",
          "application.disabled",
        ])
      )
      const serialized = JSON.stringify(audits.map((audit) => audit.metadata))
      expect(serialized).not.toContain("new-sensitive-client-id")
      expect(serialized).not.toContain("new-identity.example.com")
      expect(serialized).not.toContain("Renamed portal")
    })
  })
})
