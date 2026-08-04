import { describe, expect, it } from "vitest"
import { getSecret, upsertSecret } from "./secret.repository.js"
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
