import { and, desc, eq, isNull } from "drizzle-orm"
import { apiKeys, type ApiKey, type NewApiKey } from "../schema/index.js"
import type { DbClient } from "./types.js"

// Hashing/verifying the raw key happens at the call site — this only stores/looks up the hash.

export type CreateApiKeyInput = Omit<
  NewApiKey,
  "id" | "createdAt" | "revokedAt" | "lastUsedAt"
>

export async function createApiKey(
  db: DbClient,
  input: CreateApiKeyInput
): Promise<ApiKey> {
  const [apiKey] = await db.insert(apiKeys).values(input).returning()
  return apiKey
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

export async function revokeApiKey(db: DbClient, id: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, id))
}

export async function listApiKeys(
  db: DbClient,
  workspaceId: string,
  options: { includeRevoked?: boolean } = {}
): Promise<ApiKey[]> {
  return db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.workspaceId, workspaceId),
        options.includeRevoked ? undefined : isNull(apiKeys.revokedAt)
      )
    )
    .orderBy(desc(apiKeys.createdAt))
}
