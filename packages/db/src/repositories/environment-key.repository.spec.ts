import { configureTestEnvironment } from "./test-utils.js"
import { createApplication } from "./application.repository.js"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  environments,
  environmentKeys,
  auditLogs,
  users,
} from "../schema/index.js"
import {
  authenticateEnvironmentKey,
  createEnvironmentKey,
  listEnvironmentKeys,
  recordEnvironmentKeyActivity,
  revokeEnvironmentKey,
  rotateEnvironmentKey,
} from "./environment-key.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"

async function createEnvironmentRecord(tx: DbClient, workspaceId: string) {
  const environment = await configureTestEnvironment(tx, {
    applicationId: (
      await createApplication(tx, {
        workspaceId: workspaceId,
        name: "Other",
        slug: crypto.randomUUID(),
      })
    ).id,
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
  return environment
}

async function createActor(tx: DbClient, suffix: string) {
  const [actor] = await tx
    .insert(users)
    .values({ name: "Admin", email: `admin-${suffix}@example.com` })
    .returning()
  return actor
}

describe("Environment key repository", () => {
  it("creates, authenticates, uses, and audits an Environment-bound key", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironmentRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const result = await createEnvironmentKey(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: "Production backend",
          scopes: ["executions:start", "executions:read"],
          hashedKey: "environment-key-hash",
          keyPrefix: "lin_env_1234",
        },
        { userId: actor.id }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      expect(
        await authenticateEnvironmentKey(tx, "environment-key-hash")
      ).toMatchObject({
        id: result.environmentKey.id,
        environmentId: environment.id,
        scopes: ["executions:start", "executions:read"],
      })
      await recordEnvironmentKeyActivity(
        tx,
        result.environmentKey,
        "environment_key.used",
        { environmentId: environment.id }
      )
      const [persisted] = await tx
        .select()
        .from(environmentKeys)
        .where(eq(environmentKeys.id, result.environmentKey.id))
      expect(persisted?.lastUsedAt).toBeInstanceOf(Date)
      const audits = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, result.environmentKey.id))
      expect(audits.map((audit) => audit.action).sort()).toEqual([
        "environment_key.created",
        "environment_key.used",
      ])
      expect(
        audits.find((audit) => audit.action === "environment_key.created")
      ).toMatchObject({ actorUserId: actor.id })
      expect(
        audits.find((audit) => audit.action === "environment_key.used")
      ).toMatchObject({
        actorEnvironmentKeyId: result.environmentKey.id,
      })
    })
  })
  it("keeps listing and revocation inside one Environment and workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherWorkspace } = await createTestFixtures(tx)
      const environment = await createEnvironmentRecord(tx, organization.id)
      const otherEnvironment = await createEnvironmentRecord(
        tx,
        organization.id
      )
      const actor = await createActor(tx, organization.id)
      const result = await createEnvironmentKey(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: "Scoped key",
          scopes: ["conversations:write"],
          hashedKey: "scoped-environment-key-hash",
          keyPrefix: "lin_env_5678",
        },
        { userId: actor.id }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      expect(
        await listEnvironmentKeys(tx, organization.id, otherEnvironment.id)
      ).toEqual([])
      expect(
        await listEnvironmentKeys(tx, otherWorkspace.id, environment.id)
      ).toEqual([])
      expect(
        await createEnvironmentKey(
          tx,
          {
            workspaceId: otherWorkspace.id,
            environmentId: environment.id,
            name: "Cross-workspace key",
            scopes: ["conversations:write"],
            hashedKey: "cross-workspace-environment-key-hash",
            keyPrefix: "lin_env_cross",
          },
          { userId: actor.id }
        )
      ).toEqual({ outcome: "environment_not_found" })
      expect(
        await revokeEnvironmentKey(
          tx,
          organization.id,
          otherEnvironment.id,
          result.environmentKey.id,
          { userId: actor.id }
        )
      ).toBeUndefined()
      expect(
        await authenticateEnvironmentKey(tx, "scoped-environment-key-hash")
      ).toBeDefined()
    })
  })
  it("rotates atomically while preserving name and scopes", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironmentRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const created = await createEnvironmentKey(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: "Rotating key",
          scopes: ["events:read"],
          hashedKey: "old-environment-key-hash",
          keyPrefix: "lin_env_old1",
        },
        { userId: actor.id }
      )
      expect(created.outcome).toBe("created")
      if (created.outcome !== "created") return
      const replacement = await rotateEnvironmentKey(
        tx,
        organization.id,
        environment.id,
        created.environmentKey.id,
        { hashedKey: "new-environment-key-hash", keyPrefix: "lin_env_new1" },
        { userId: actor.id }
      )
      expect(replacement).toMatchObject({
        name: "Rotating key",
        scopes: ["events:read"],
      })
      expect(
        await authenticateEnvironmentKey(tx, "old-environment-key-hash")
      ).toBeUndefined()
      expect(
        await authenticateEnvironmentKey(tx, "new-environment-key-hash")
      ).toMatchObject({ id: replacement?.id })
      const [oldKey] = await tx
        .select()
        .from(environmentKeys)
        .where(eq(environmentKeys.id, created.environmentKey.id))
      expect(oldKey?.revokedAt).toBeInstanceOf(Date)
      const [audit] = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "environment_key.rotated"))
      expect(audit?.metadata).toEqual({
        environmentId: environment.id,
        replacementKeyId: replacement?.id,
      })
    })
  })
  it("revokes idempotently and rejects keys for disabled Environments", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironmentRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const created = await createEnvironmentKey(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: "Revocable key",
          scopes: ["webhooks:read"],
          hashedKey: "revocable-environment-key-hash",
          keyPrefix: "lin_env_rev1",
        },
        { userId: actor.id }
      )
      expect(created.outcome).toBe("created")
      if (created.outcome !== "created") return
      await tx
        .update(environments)
        .set({ enabled: false })
        .where(eq(environments.id, environment.id))
      expect(
        await createEnvironmentKey(
          tx,
          {
            workspaceId: organization.id,
            environmentId: environment.id,
            name: "Dead key",
            scopes: ["webhooks:read"],
            hashedKey: "disabled-environment-key-hash",
            keyPrefix: "lin_env_dis1",
          },
          { userId: actor.id }
        )
      ).toEqual({ outcome: "environment_disabled" })
      expect(
        await authenticateEnvironmentKey(tx, "revocable-environment-key-hash")
      ).toBeUndefined()
      const first = await revokeEnvironmentKey(
        tx,
        organization.id,
        environment.id,
        created.environmentKey.id,
        { userId: actor.id }
      )
      const second = await revokeEnvironmentKey(
        tx,
        organization.id,
        environment.id,
        created.environmentKey.id,
        { userId: actor.id }
      )
      expect(first?.revokedAt).toBeInstanceOf(Date)
      expect(second?.revokedAt).toEqual(first?.revokedAt)
      expect(
        await authenticateEnvironmentKey(tx, "revocable-environment-key-hash")
      ).toBeUndefined()
    })
  })
})
