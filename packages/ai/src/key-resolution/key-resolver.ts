import {
  decryptSecret,
  isCorruptedEncryptedSecret,
  isEncryptedSecret,
  repositories,
} from "@linea/db"

type DbClient = repositories.DbClient

export type ResolvedApiKey = {
  apiKey: string
  source: "workspace" | "platform"
}

export async function resolveApiKey(
  db: DbClient,
  workspaceId: string,
  keyName: string
): Promise<ResolvedApiKey> {
  const secret = await repositories.secret.getSecret(db, workspaceId, keyName)
  if (secret) {
    // A value stored before encryption existed (or written directly, bypassing the Secrets API) won't match the encrypted format — use it as-is rather than failing the whole node on a decrypt error. Every write through the Secrets API always encrypts, so this path only ever serves legacy or out-of-band values.
    if (isEncryptedSecret(secret.encryptedValue)) {
      return {
        apiKey: decryptSecret(secret.encryptedValue),
        source: "workspace",
      }
    }
    // Shaped like our encrypted format but fails validation (e.g. a truncated auth tag) — a corrupted stored secret, not legacy plaintext. Reject it rather than sending the ciphertext blob to the provider as if it were a real key.
    if (isCorruptedEncryptedSecret(secret.encryptedValue)) {
      throw new Error(
        `Stored secret for "${keyName}" is corrupted and cannot be decrypted`
      )
    }
    return { apiKey: secret.encryptedValue, source: "workspace" }
  }

  const platformKey = process.env[keyName]
  if (!platformKey) {
    throw new Error(`No workspace key and no platform key set for "${keyName}"`)
  }
  return { apiKey: platformKey, source: "platform" }
}
