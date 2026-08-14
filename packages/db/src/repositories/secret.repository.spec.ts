import { describe, expect, it } from "vitest"
import {
  deleteSecret,
  getSecret,
  listSecrets,
  upsertSecret,
} from "./secret.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("upsertSecret", () => {
  it("creates a secret and then overwrites it on the same key", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)

      await upsertSecret(tx, organization.id, "API_KEY", "encrypted-v1")
      const first = await getSecret(tx, organization.id, "API_KEY")
      expect(first?.encryptedValue).toBe("encrypted-v1")

      await upsertSecret(tx, organization.id, "API_KEY", "encrypted-v2")
      const second = await getSecret(tx, organization.id, "API_KEY")
      expect(second?.encryptedValue).toBe("encrypted-v2")
      expect(second?.id).toBe(first?.id)
    })
  })

  it("scopes secrets by workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)

      await upsertSecret(tx, organization.id, "API_KEY", "encrypted-v1")
      const found = await getSecret(tx, otherOrg.id, "API_KEY")
      expect(found).toBeUndefined()
    })
  })
})

describe("listSecrets", () => {
  it("lists keys for a workspace without exposing encryptedValue, scoped by workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)

      await upsertSecret(tx, organization.id, "ANTHROPIC_API_KEY", "cipher-a")
      await upsertSecret(tx, organization.id, "OPENAI_API_KEY", "cipher-b")
      await upsertSecret(tx, otherOrg.id, "ANTHROPIC_API_KEY", "cipher-c")

      const list = await listSecrets(tx, organization.id)
      expect(list.map((s) => s.key).sort()).toEqual([
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
      ])
      expect(list.every((s) => !("encryptedValue" in s))).toBe(true)
    })
  })
})

describe("deleteSecret", () => {
  it("removes a secret and returns undefined for a second delete", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      await upsertSecret(tx, organization.id, "API_KEY", "encrypted-v1")

      const deleted = await deleteSecret(tx, organization.id, "API_KEY")
      expect(deleted?.key).toBe("API_KEY")
      expect(await getSecret(tx, organization.id, "API_KEY")).toBeUndefined()

      expect(await deleteSecret(tx, organization.id, "API_KEY")).toBeUndefined()
    })
  })

  it("does not delete a same-key secret in another workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)
      await upsertSecret(tx, organization.id, "API_KEY", "encrypted-v1")
      await upsertSecret(tx, otherOrg.id, "API_KEY", "encrypted-v2")

      await deleteSecret(tx, organization.id, "API_KEY")
      expect(await getSecret(tx, otherOrg.id, "API_KEY")).toBeDefined()
    })
  })
})
