import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { auditLogs, users } from "../schema/index.js"
import {
  createApiKey,
  getApiKeyByHash,
  listApiKeys,
  revokeApiKey,
  revokeApiKeysCreatedBy,
  touchApiKeyLastUsed,
  type CreateApiKeyInput,
} from "./api-key.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function createUser(tx: Transaction) {
  const [user] = await tx
    .insert(users)
    .values({
      name: "Key Creator",
      email: `key-creator-${randomUUID()}@example.com`,
      emailVerified: true,
    })
    .returning()
  return user
}

function keyInput(
  workspaceId: string,
  createdByUserId: string,
  hashedKey: string
): CreateApiKeyInput {
  return {
    workspaceId,
    createdByUserId,
    name: "CI key",
    scopes: ["regressions:read"],
    hashedKey,
    keyPrefix: `lin_${hashedKey}`,
    expiresAt: new Date(Date.now() + 86_400_000),
  }
}

describe("api-key repository", () => {
  it("creates a key with its scopes, creator and expiry, audited, and looks it up by hash", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createUser(tx)
      const created = await createApiKey(
        tx,
        keyInput(organization.id, user.id, "hash-abc")
      )
      const found = await getApiKeyByHash(tx, "hash-abc")
      expect(found?.id).toBe(created.id)
      expect(found?.scopes).toEqual(["regressions:read"])
      expect(found?.createdByUserId).toBe(user.id)
      expect(found?.expiresAt).toBeInstanceOf(Date)
      const audits = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, created.id))
      expect(audits).toMatchObject([
        { action: "api_key.created", actorUserId: user.id },
      ])
    })
  })

  it("touches lastUsedAt without changing the hash", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createUser(tx)
      const created = await createApiKey(
        tx,
        keyInput(organization.id, user.id, "hash-def")
      )
      expect(created.lastUsedAt).toBeNull()
      await touchApiKeyLastUsed(tx, created.id)
      const found = await getApiKeyByHash(tx, "hash-def")
      expect(found?.lastUsedAt).toBeInstanceOf(Date)
    })
  })

  it("revokes a key by stamping revokedAt and auditing the revocation once", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createUser(tx)
      const created = await createApiKey(
        tx,
        keyInput(organization.id, user.id, "hash-ghi")
      )
      await revokeApiKey(tx, organization.id, created.id, user.id)
      const found = await getApiKeyByHash(tx, "hash-ghi")
      expect(found?.revokedAt).toBeInstanceOf(Date)
      expect(
        await revokeApiKey(tx, organization.id, created.id, user.id)
      ).toBeUndefined()
      const deletions = await tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceId, created.id),
            eq(auditLogs.action, "api_key.deleted")
          )
        )
      expect(deletions).toHaveLength(1)
    })
  })

  it("does not revoke a key belonging to a different workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)
      const user = await createUser(tx)
      const created = await createApiKey(
        tx,
        keyInput(organization.id, user.id, "hash-cross-workspace")
      )
      const result = await revokeApiKey(tx, otherOrg.id, created.id, user.id)
      expect(result).toBeUndefined()
      const found = await getApiKeyByHash(tx, "hash-cross-workspace")
      expect(found?.revokedAt).toBeNull()
    })
  })

  it("revokes only the live keys a removed member minted in that workspace", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)
      const creator = await createUser(tx)
      const colleague = await createUser(tx)
      const own = await createApiKey(
        tx,
        keyInput(organization.id, creator.id, "hash-own")
      )
      await createApiKey(
        tx,
        keyInput(otherOrg.id, creator.id, "hash-elsewhere")
      )
      await createApiKey(
        tx,
        keyInput(organization.id, colleague.id, "hash-colleague")
      )
      const revoked = await revokeApiKeysCreatedBy(
        tx,
        organization.id,
        creator.id
      )
      expect(revoked.map((key) => key.id)).toEqual([own.id])
      expect((await getApiKeyByHash(tx, "hash-elsewhere"))?.revokedAt).toBe(
        null
      )
      expect((await getApiKeyByHash(tx, "hash-colleague"))?.revokedAt).toBe(
        null
      )
      const [audit] = await tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceId, own.id),
            eq(auditLogs.action, "api_key.deleted")
          )
        )
      expect(audit?.metadata).toEqual({ reason: "creator_removed" })
    })
  })

  it("deletes a key when its creator's user account is deleted", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createUser(tx)
      await createApiKey(tx, keyInput(organization.id, user.id, "hash-gone"))
      await tx.delete(users).where(eq(users.id, user.id))
      expect(await getApiKeyByHash(tx, "hash-gone")).toBeUndefined()
    })
  })

  it("lists keys scoped to a workspace with their creator, excluding revoked ones by default", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)
      const user = await createUser(tx)
      const active = await createApiKey(
        tx,
        keyInput(organization.id, user.id, "hash-list-active")
      )
      const revoked = await createApiKey(
        tx,
        keyInput(organization.id, user.id, "hash-list-revoked")
      )
      await revokeApiKey(tx, organization.id, revoked.id, user.id)
      await createApiKey(tx, keyInput(otherOrg.id, user.id, "hash-list-other"))
      const defaultList = await listApiKeys(tx, organization.id)
      expect(defaultList.map((k) => k.id)).toEqual([active.id])
      expect(defaultList[0]?.createdBy).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      const fullList = await listApiKeys(tx, organization.id, {
        includeRevoked: true,
      })
      expect(fullList.map((k) => k.id).sort()).toEqual(
        [active.id, revoked.id].sort()
      )
    })
  })
})
