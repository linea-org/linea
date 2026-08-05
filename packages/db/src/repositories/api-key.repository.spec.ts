import { describe, expect, it } from "vitest"
import {
  createApiKey,
  getApiKeyByHash,
  listApiKeys,
  revokeApiKey,
  touchApiKeyLastUsed,
} from "./api-key.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("api-key repository", () => {
  it("creates a key and looks it up by hash", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)

      const created = await createApiKey(tx, {
        workspaceId: organization.id,
        name: "CI key",
        hashedKey: "hash-abc",
        keyPrefix: "lin_abc",
      })

      const found = await getApiKeyByHash(tx, "hash-abc")
      expect(found?.id).toBe(created.id)
      expect(found?.purpose).toBe("platform")
    })
  })

  it("touches lastUsedAt without changing the hash", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const created = await createApiKey(tx, {
        workspaceId: organization.id,
        name: "CI key",
        hashedKey: "hash-def",
        keyPrefix: "lin_def",
      })
      expect(created.lastUsedAt).toBeNull()

      await touchApiKeyLastUsed(tx, created.id)
      const found = await getApiKeyByHash(tx, "hash-def")
      expect(found?.lastUsedAt).toBeInstanceOf(Date)
    })
  })

  it("revokes a key by stamping revokedAt", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const created = await createApiKey(tx, {
        workspaceId: organization.id,
        name: "CI key",
        hashedKey: "hash-ghi",
        keyPrefix: "lin_ghi",
      })

      await revokeApiKey(tx, organization.id, created.id)
      const found = await getApiKeyByHash(tx, "hash-ghi")
      expect(found?.revokedAt).toBeInstanceOf(Date)
    })
  })

  it("does not revoke a key belonging to a different workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)
      const created = await createApiKey(tx, {
        workspaceId: organization.id,
        name: "CI key",
        hashedKey: "hash-cross-workspace",
        keyPrefix: "lin_cw",
      })

      const result = await revokeApiKey(tx, otherOrg.id, created.id)
      expect(result).toBeUndefined()

      const found = await getApiKeyByHash(tx, "hash-cross-workspace")
      expect(found?.revokedAt).toBeNull()
    })
  })

  it("lists keys scoped to a workspace, excluding revoked ones by default", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)

      const active = await createApiKey(tx, {
        workspaceId: organization.id,
        name: "Active key",
        hashedKey: "hash-list-active",
        keyPrefix: "lin_a",
      })
      const revoked = await createApiKey(tx, {
        workspaceId: organization.id,
        name: "Revoked key",
        hashedKey: "hash-list-revoked",
        keyPrefix: "lin_r",
      })
      await revokeApiKey(tx, organization.id, revoked.id)
      await createApiKey(tx, {
        workspaceId: otherOrg.id,
        name: "Other workspace key",
        hashedKey: "hash-list-other",
        keyPrefix: "lin_o",
      })

      const defaultList = await listApiKeys(tx, organization.id)
      expect(defaultList.map((k) => k.id)).toEqual([active.id])

      const fullList = await listApiKeys(tx, organization.id, {
        includeRevoked: true,
      })
      expect(fullList.map((k) => k.id).sort()).toEqual(
        [active.id, revoked.id].sort()
      )
    })
  })
})
