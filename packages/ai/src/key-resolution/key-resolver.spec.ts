import { randomBytes, randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import { db, encryptSecret, repositories, schema } from "@linea/db"
import { resolveApiKey } from "./key-resolver.js"

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64")
})

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const rollbackSentinel = new Error("test transaction rollback")

async function withRollback(
  fn: (tx: Transaction) => Promise<void>
): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx)
      throw rollbackSentinel
    })
    .catch((error: unknown) => {
      if (error !== rollbackSentinel) throw error
    })
}

async function createTestOrganization(tx: Transaction) {
  const [organization] = await tx
    .insert(schema.organizations)
    .values({
      name: "Test Org",
      slug: `test-org-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning()
  return organization
}

describe("resolveApiKey", () => {
  it("prefers a workspace's own key over the platform key", async () => {
    await withRollback(async (tx) => {
      const organization = await createTestOrganization(tx)
      process.env.TEST_PROVIDER_KEY = "platform-key"
      await repositories.secret.upsertSecret(
        tx,
        organization.id,
        "TEST_PROVIDER_KEY",
        encryptSecret("workspace-key")
      )

      const resolved = await resolveApiKey(
        tx,
        organization.id,
        "TEST_PROVIDER_KEY"
      )

      expect(resolved).toEqual({ apiKey: "workspace-key", source: "workspace" })
      delete process.env.TEST_PROVIDER_KEY
    })
  })

  it("falls back to the platform key when the workspace has none", async () => {
    await withRollback(async (tx) => {
      const organization = await createTestOrganization(tx)
      process.env.TEST_PROVIDER_KEY = "platform-key"

      const resolved = await resolveApiKey(
        tx,
        organization.id,
        "TEST_PROVIDER_KEY"
      )

      expect(resolved).toEqual({ apiKey: "platform-key", source: "platform" })
      delete process.env.TEST_PROVIDER_KEY
    })
  })

  it("throws when neither a workspace key nor a platform key exists", async () => {
    await withRollback(async (tx) => {
      const organization = await createTestOrganization(tx)
      delete process.env.TEST_PROVIDER_KEY_MISSING

      await expect(
        resolveApiKey(tx, organization.id, "TEST_PROVIDER_KEY_MISSING")
      ).rejects.toThrow(/No workspace key and no platform key/)
    })
  })

  it("uses a legacy plaintext value as-is instead of failing to decrypt it", async () => {
    await withRollback(async (tx) => {
      const organization = await createTestOrganization(tx)
      // Written directly, bypassing encryptSecret — simulates a value stored before encryption existed.
      await repositories.secret.upsertSecret(
        tx,
        organization.id,
        "TEST_PROVIDER_KEY",
        "legacy-plaintext-key"
      )

      const resolved = await resolveApiKey(
        tx,
        organization.id,
        "TEST_PROVIDER_KEY"
      )

      expect(resolved).toEqual({
        apiKey: "legacy-plaintext-key",
        source: "workspace",
      })
    })
  })
})
