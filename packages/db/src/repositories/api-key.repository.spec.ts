import { describe, expect, it } from "vitest"
import {
  createApiKey,
  getApiKeyByHash,
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

      await revokeApiKey(tx, created.id)
      const found = await getApiKeyByHash(tx, "hash-ghi")
      expect(found?.revokedAt).toBeInstanceOf(Date)
    })
  })
})
