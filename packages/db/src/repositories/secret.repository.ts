import { and, eq } from "drizzle-orm"
import { secrets, type Secret } from "../schema/index.js"
import type { DbClient } from "./types.js"

// Encrypting/decrypting happens at the call site — this only stores/retrieves ciphertext.

export async function upsertSecret(
  db: DbClient,
  workspaceId: string,
  key: string,
  encryptedValue: string
): Promise<Secret> {
  const [secret] = await db
    .insert(secrets)
    .values({ workspaceId, key, encryptedValue })
    .onConflictDoUpdate({
      target: [secrets.workspaceId, secrets.key],
      set: { encryptedValue, updatedAt: new Date() },
    })
    .returning()
  return secret
}

export async function getSecret(
  db: DbClient,
  workspaceId: string,
  key: string
): Promise<Secret | undefined> {
  const [secret] = await db
    .select()
    .from(secrets)
    .where(and(eq(secrets.workspaceId, workspaceId), eq(secrets.key, key)))
  return secret
}
