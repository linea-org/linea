import { configureTestEnvironment } from "./test-utils.js"
import { createApplication } from "./application.repository.js"
import { and, eq, ne } from "drizzle-orm"
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
  deleteEnvironmentKeyActivityBefore,
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
        { environmentId: environment.id },
        new Date()
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
  it("coalesces repeated use and denials into bounded audit rows", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironmentRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const keys = []
      for (const suffix of ["coalesced", "untouched"]) {
        const result = await createEnvironmentKey(
          tx,
          {
            workspaceId: organization.id,
            environmentId: environment.id,
            name: suffix,
            scopes: ["executions:read"],
            hashedKey: `${suffix}-${crypto.randomUUID()}`,
            keyPrefix: "lin_env_coal",
          },
          { userId: actor.id }
        )
        if (result.outcome !== "created") throw new Error(result.outcome)
        keys.push(result.environmentKey)
      }
      const [key, untouched] = keys
      const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
      const activity = async (keyId: string) =>
        (
          await tx
            .select({ action: auditLogs.action })
            .from(auditLogs)
            .where(
              and(
                eq(auditLogs.resourceId, keyId),
                ne(auditLogs.action, "environment_key.created")
              )
            )
        ).map((row) => row.action)
      for (let attempt = 0; attempt < 50; attempt++) {
        const at = new Date(now.getTime() + attempt * 1000)
        await recordEnvironmentKeyActivity(
          tx,
          key,
          "environment_key.used",
          { environmentId: environment.id },
          at
        )
        await recordEnvironmentKeyActivity(
          tx,
          key,
          "environment_key.scope_denied",
          { requiredScopes: ["executions:start"] },
          at
        )
        await recordEnvironmentKeyActivity(
          tx,
          key,
          "environment_key.cross_environment_access_denied",
          { requestedEnvironmentId: crypto.randomUUID() },
          at
        )
      }
      const coalesced = await activity(key.id)
      expect(
        coalesced.filter((action) => action === "environment_key.used")
      ).toHaveLength(1)
      expect(
        coalesced.filter((action) => action === "environment_key.scope_denied")
      ).toHaveLength(1)
      expect(
        coalesced.filter(
          (action) =>
            action === "environment_key.cross_environment_access_denied"
        )
      ).toHaveLength(20)
      const [touched] = await tx
        .select({ lastUsedAt: environmentKeys.lastUsedAt })
        .from(environmentKeys)
        .where(eq(environmentKeys.id, key.id))
      expect(touched?.lastUsedAt).toEqual(now)
      await recordEnvironmentKeyActivity(
        tx,
        key,
        "environment_key.scope_denied",
        { requiredScopes: ["conversations:write"] },
        now
      )
      const nextHour = new Date(now.getTime() + 3_600_000)
      await recordEnvironmentKeyActivity(
        tx,
        key,
        "environment_key.used",
        { environmentId: environment.id },
        nextHour
      )
      await recordEnvironmentKeyActivity(
        tx,
        key,
        "environment_key.scope_denied",
        { requiredScopes: ["executions:start"] },
        nextHour
      )
      expect((await activity(key.id)).length).toBe(coalesced.length + 3)
      await recordEnvironmentKeyActivity(
        tx,
        untouched,
        "environment_key.scope_denied",
        { requiredScopes: ["executions:start"] },
        now
      )
      expect(await activity(untouched.id)).toEqual([
        "environment_key.scope_denied",
      ])
    })
  })
  it("expires Environment key activity audit rows but keeps lifecycle rows", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironmentRecord(tx, organization.id)
      const actor = await createActor(tx, organization.id)
      const result = await createEnvironmentKey(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: "Retained key",
          scopes: ["executions:read"],
          hashedKey: `retained-${crypto.randomUUID()}`,
          keyPrefix: "lin_env_keep",
        },
        { userId: actor.id }
      )
      if (result.outcome !== "created") throw new Error(result.outcome)
      await recordEnvironmentKeyActivity(
        tx,
        result.environmentKey,
        "environment_key.used",
        { environmentId: environment.id },
        new Date()
      )
      await tx
        .update(auditLogs)
        .set({ createdAt: new Date("2000-01-01T00:00:00Z") })
        .where(eq(auditLogs.resourceId, result.environmentKey.id))
      expect(
        await deleteEnvironmentKeyActivityBefore(
          tx,
          new Date("2001-01-01T00:00:00Z")
        )
      ).toBeGreaterThanOrEqual(1)
      const remaining = await tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, result.environmentKey.id))
      expect(remaining.map((row) => row.action)).toEqual([
        "environment_key.created",
      ])
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
