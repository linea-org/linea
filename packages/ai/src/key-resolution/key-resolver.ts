import { decryptSecret, isEncryptedSecret, repositories } from "@linea/db"

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
    const apiKey = isEncryptedSecret(secret.encryptedValue)
      ? decryptSecret(secret.encryptedValue)
      : secret.encryptedValue
    return { apiKey, source: "workspace" }
  }

  const platformKey = process.env[keyName]
  if (!platformKey) {
    throw new Error(`No workspace key and no platform key set for "${keyName}"`)
  }
  return { apiKey: platformKey, source: "platform" }
}
