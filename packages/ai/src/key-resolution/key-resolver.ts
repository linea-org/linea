import { decryptSecret, repositories } from "@linea/db"

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
    return { apiKey: decryptSecret(secret.encryptedValue), source: "workspace" }
  }

  const platformKey = process.env[keyName]
  if (!platformKey) {
    throw new Error(`No workspace key and no platform key set for "${keyName}"`)
  }
  return { apiKey: platformKey, source: "platform" }
}
