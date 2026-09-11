import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  applications,
  applicationKeys,
  auditLogs,
  users,
} from "../schema/index.js"
import {
  authenticateApplicationKey,
  createApplicationKey,
  listApplicationKeys,
  recordApplicationKeyActivity,
  revokeApplicationKey,
  rotateApplicationKey,
} from "./application-key.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"

async function createApplicationRecord(tx: DbClient, workspaceId: string) {
  const [application] = await tx
    .insert(applications)
    .values({
      workspaceId,
      environment: "production",
      displayName: "Customer portal",
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: "customer-portal",
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  return application
}

async function createActor(tx: DbClient, suffix: string) {
  const [actor] = await tx
    .insert(users)
    .values({ name: "Admin", email: `admin-${suffix}@example.com` })
    .returning()
  return actor
}

describe("Application key repository", () => {
  it("creates, authenticates, uses, and audits an Application-bound key", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const application = await createApplicationRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const result = await createApplicationKey(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          name: "Production backend",
          scopes: ["executions:start", "executions:read"],
          hashedKey: "application-key-hash",
          keyPrefix: "lin_app_1234",
        },
        { userId: actor.id }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      expect(
        await authenticateApplicationKey(tx, "application-key-hash")
      ).toMatchObject({
        id: result.applicationKey.id,
        applicationId: application.id,
        scopes: ["executions:start", "executions:read"],
      })
      await recordApplicationKeyActivity(
        tx,
        result.applicationKey,
        "application_key.used",
        { applicationId: application.id }
      )
      const [persisted] = await tx
        .select()
        .from(applicationKeys)
        .where(eq(applicationKeys.id, result.applicationKey.id))
      expect(persisted?.lastUsedAt).toBeInstanceOf(Date)
      const audits = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, result.applicationKey.id))
      expect(audits.map((audit) => audit.action).sort()).toEqual([
        "application_key.created",
        "application_key.used",
      ])
      expect(
        audits.find((audit) => audit.action === "application_key.created")
      ).toMatchObject({ actorUserId: actor.id })
      expect(
        audits.find((audit) => audit.action === "application_key.used")
      ).toMatchObject({
        actorApplicationKeyId: result.applicationKey.id,
      })
    })
  })

  it("keeps listing and revocation inside one Application and workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherWorkspace } = await createTestFixtures(tx)
      const application = await createApplicationRecord(tx, organization.id)
      const otherApplication = await createApplicationRecord(
        tx,
        organization.id
      )
      const actor = await createActor(tx, organization.id)
      const result = await createApplicationKey(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          name: "Scoped key",
          scopes: ["conversations:write"],
          hashedKey: "scoped-application-key-hash",
          keyPrefix: "lin_app_5678",
        },
        { userId: actor.id }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      expect(
        await listApplicationKeys(tx, organization.id, otherApplication.id)
      ).toEqual([])
      expect(
        await listApplicationKeys(tx, otherWorkspace.id, application.id)
      ).toEqual([])
      expect(
        await createApplicationKey(
          tx,
          {
            workspaceId: otherWorkspace.id,
            applicationId: application.id,
            name: "Cross-workspace key",
            scopes: ["conversations:write"],
            hashedKey: "cross-workspace-application-key-hash",
            keyPrefix: "lin_app_cross",
          },
          { userId: actor.id }
        )
      ).toEqual({ outcome: "application_not_found" })
      expect(
        await revokeApplicationKey(
          tx,
          organization.id,
          otherApplication.id,
          result.applicationKey.id,
          { userId: actor.id }
        )
      ).toBeUndefined()
      expect(
        await authenticateApplicationKey(tx, "scoped-application-key-hash")
      ).toBeDefined()
    })
  })

  it("rotates atomically while preserving name and scopes", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const application = await createApplicationRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const created = await createApplicationKey(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          name: "Rotating key",
          scopes: ["events:read"],
          hashedKey: "old-application-key-hash",
          keyPrefix: "lin_app_old1",
        },
        { userId: actor.id }
      )
      expect(created.outcome).toBe("created")
      if (created.outcome !== "created") return
      const replacement = await rotateApplicationKey(
        tx,
        organization.id,
        application.id,
        created.applicationKey.id,
        { hashedKey: "new-application-key-hash", keyPrefix: "lin_app_new1" },
        { userId: actor.id }
      )
      expect(replacement).toMatchObject({
        name: "Rotating key",
        scopes: ["events:read"],
      })
      expect(
        await authenticateApplicationKey(tx, "old-application-key-hash")
      ).toBeUndefined()
      expect(
        await authenticateApplicationKey(tx, "new-application-key-hash")
      ).toMatchObject({ id: replacement?.id })
      const [oldKey] = await tx
        .select()
        .from(applicationKeys)
        .where(eq(applicationKeys.id, created.applicationKey.id))
      expect(oldKey?.revokedAt).toBeInstanceOf(Date)
      const [audit] = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "application_key.rotated"))
      expect(audit?.metadata).toEqual({
        applicationId: application.id,
        replacementKeyId: replacement?.id,
      })
    })
  })

  it("revokes idempotently and rejects keys for disabled Applications", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const application = await createApplicationRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const created = await createApplicationKey(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          name: "Revocable key",
          scopes: ["webhooks:read"],
          hashedKey: "revocable-application-key-hash",
          keyPrefix: "lin_app_rev1",
        },
        { userId: actor.id }
      )
      expect(created.outcome).toBe("created")
      if (created.outcome !== "created") return
      await tx
        .update(applications)
        .set({ enabled: false })
        .where(eq(applications.id, application.id))
      expect(
        await authenticateApplicationKey(tx, "revocable-application-key-hash")
      ).toBeUndefined()
      await tx
        .update(applications)
        .set({ enabled: true })
        .where(eq(applications.id, application.id))
      const first = await revokeApplicationKey(
        tx,
        organization.id,
        application.id,
        created.applicationKey.id,
        { userId: actor.id }
      )
      const second = await revokeApplicationKey(
        tx,
        organization.id,
        application.id,
        created.applicationKey.id,
        { userId: actor.id }
      )
      expect(first?.revokedAt).toBeInstanceOf(Date)
      expect(second?.revokedAt).toEqual(first?.revokedAt)
      expect(
        await authenticateApplicationKey(tx, "revocable-application-key-hash")
      ).toBeUndefined()
    })
  })
})
