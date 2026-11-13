import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm"
import {
  apiKeys,
  auditLogs,
  users,
  type ApiKey,
  type NewAuditLog,
} from "../schema/index.js"
import type { DbClient, Transaction } from "./types.js"

// Hashing/verifying the raw key happens at the call site — this only stores/looks up the hash.

export type CreateApiKeyInput = {
  workspaceId: string
  name: string
  scopes: ApiKey["scopes"]
  hashedKey: string
  keyPrefix: string
  expiresAt: Date
  createdByUserId: string
}

export type ApiKeyCreator = { id: string; name: string; email: string }

export type ApiKeyWithCreator = ApiKey & { createdBy: ApiKeyCreator | null }

async function recordApiKeyAudit(
  tx: Transaction,
  apiKey: ApiKey,
  actorUserId: string | null,
  action: Extract<NewAuditLog["action"], "api_key.created" | "api_key.deleted">,
  metadata: Record<string, unknown>
): Promise<void> {
  await tx.insert(auditLogs).values({
    workspaceId: apiKey.workspaceId,
    actorUserId,
    action,
    resource: "api_key",
    resourceId: apiKey.id,
    metadata,
  })
}

export async function createApiKey(
  db: DbClient,
  input: CreateApiKeyInput
): Promise<ApiKey> {
  return db.transaction(async (tx) => {
    const [apiKey] = await tx.insert(apiKeys).values(input).returning()
    await recordApiKeyAudit(
      tx,
      apiKey,
      input.createdByUserId,
      "api_key.created",
      {
        name: apiKey.name,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt.toISOString(),
      }
    )
    return apiKey
  })
}

export async function getApiKeyByHash(
  db: DbClient,
  hashedKey: string
): Promise<ApiKey | undefined> {
  const [apiKey] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.hashedKey, hashedKey))
  return apiKey
}

export async function touchApiKeyLastUsed(
  db: DbClient,
  id: string
): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, id))
}

/** Scoped by workspaceId in the same query, not a separate ownership check, so a caller can't revoke a key it doesn't own by guessing its id. */
export async function revokeApiKey(
  db: DbClient,
  workspaceId: string,
  id: string,
  actorUserId: string
): Promise<ApiKey | undefined> {
  return db.transaction(async (tx) => {
    const [apiKey] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKeys.workspaceId, workspaceId),
          eq(apiKeys.id, id),
          isNull(apiKeys.revokedAt)
        )
      )
      .returning()
    if (apiKey)
      await recordApiKeyAudit(tx, apiKey, actorUserId, "api_key.deleted", {
        reason: "revoked",
      })
    return apiKey
  })
}

/** A key must not outlive its creator's membership, so removing a member revokes every live key they minted in that workspace. */
export async function revokeApiKeysCreatedBy(
  db: DbClient,
  workspaceId: string,
  createdByUserId: string
): Promise<ApiKey[]> {
  return db.transaction(async (tx) => {
    const revoked = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKeys.workspaceId, workspaceId),
          eq(apiKeys.createdByUserId, createdByUserId),
          isNull(apiKeys.revokedAt)
        )
      )
      .returning()
    for (const apiKey of revoked)
      await recordApiKeyAudit(tx, apiKey, null, "api_key.deleted", {
        reason: "creator_removed",
      })
    return revoked
  })
}

export async function listApiKeys(
  db: DbClient,
  workspaceId: string,
  options: { includeRevoked?: boolean } = {}
): Promise<ApiKeyWithCreator[]> {
  const rows = await db
    .select({
      apiKey: getTableColumns(apiKeys),
      creatorName: users.name,
      creatorEmail: users.email,
    })
    .from(apiKeys)
    .leftJoin(users, eq(users.id, apiKeys.createdByUserId))
    .where(
      and(
        eq(apiKeys.workspaceId, workspaceId),
        options.includeRevoked ? undefined : isNull(apiKeys.revokedAt)
      )
    )
    .orderBy(desc(apiKeys.createdAt))
  return rows.map(({ apiKey, creatorName, creatorEmail }) => ({
    ...apiKey,
    createdBy:
      apiKey.createdByUserId && creatorName !== null && creatorEmail !== null
        ? { id: apiKey.createdByUserId, name: creatorName, email: creatorEmail }
        : null,
  }))
}
