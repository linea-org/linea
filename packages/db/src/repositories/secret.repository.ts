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

// Never selects encryptedValue — the list surface is for management UI, not for reading secret values back out.
export async function listSecrets(
  db: DbClient,
  workspaceId: string
): Promise<Omit<Secret, "encryptedValue">[]> {
  return db
    .select({
      id: secrets.id,
      workspaceId: secrets.workspaceId,
      key: secrets.key,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .where(eq(secrets.workspaceId, workspaceId))
    .orderBy(secrets.key)
}

export async function deleteSecret(
  db: DbClient,
  workspaceId: string,
  key: string
): Promise<Secret | undefined> {
  const [secret] = await db
    .delete(secrets)
    .where(and(eq(secrets.workspaceId, workspaceId), eq(secrets.key, key)))
    .returning()
  return secret
}
