import { repositories } from "@linea/db"

type DbClient = repositories.DbClient

export type ResolvedApiKey = {
  apiKey: string
  source: "workspace" | "platform"
}

/** SECURITY GAP, tracked not silent: no encryption exists yet, a workspace's key passes through as plaintext — see roadmap.md before trusting this with a real key. */
export async function resolveApiKey(
  db: DbClient,
  workspaceId: string,
  keyName: string
): Promise<ResolvedApiKey> {
  const secret = await repositories.secret.getSecret(db, workspaceId, keyName)
  if (secret) {
    return { apiKey: secret.encryptedValue, source: "workspace" }
  }

  const platformKey = process.env[keyName]
  if (!platformKey) {
    throw new Error(`No workspace key and no platform key set for "${keyName}"`)
  }
  return { apiKey: platformKey, source: "platform" }
}
