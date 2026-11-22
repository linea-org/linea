import {
  decryptSecret,
  isCorruptedEncryptedSecret,
  isEncryptedSecret,
  repositories,
  type DbClient,
} from "@linealabs/db"
import { isFlagEnabled } from "@linealabs/flags"
import { assertPlatformKeyBudget } from "../usage-budget.js"

const DAY_MS = 24 * 60 * 60 * 1000

export type ResolvedApiKey = {
  apiKey: string
  source: "environment" | "platform"
}

export class ModelKeyMissingError extends Error {
  constructor(readonly keyName: string) {
    super(
      `No ${keyName} is set. Add your key under Settings, Models to run this step.`
    )
    this.name = "ModelKeyMissingError"
  }
}

export async function isPlatformModelKeyAvailable(
  workspaceId: string,
  keyName: string
): Promise<boolean> {
  return (
    Boolean(process.env[keyName]) &&
    (await isFlagEnabled("platformModelKey", workspaceId))
  )
}

/** The platform's own provider key is used only for workspaces Linea has granted it to; anything else needs an Environment key. */
export async function resolveApiKey(
  db: DbClient,
  input: { workspaceId: string; environmentId?: string; keyName: string }
): Promise<ResolvedApiKey> {
  const { workspaceId, environmentId, keyName } = input
  const secret = environmentId
    ? await repositories.secret.getSecret(db, environmentId, keyName)
    : undefined
  if (secret) {
    // A value stored before encryption existed (or written directly, bypassing the Secrets API) won't match the encrypted format — use it as-is rather than failing the whole node on a decrypt error. Every write through the Secrets API always encrypts, so this path only ever serves legacy or out-of-band values.
    if (isEncryptedSecret(secret.encryptedValue)) {
      return {
        apiKey: decryptSecret(secret.encryptedValue),
        source: "environment",
      }
    }
    // Shaped like our encrypted format but fails validation (e.g. a truncated auth tag) — a corrupted stored secret, not legacy plaintext. Reject it rather than sending the ciphertext blob to the provider as if it were a real key.
    if (isCorruptedEncryptedSecret(secret.encryptedValue)) {
      throw new Error(
        `Stored secret for "${keyName}" is corrupted and cannot be decrypted`
      )
    }
    return { apiKey: secret.encryptedValue, source: "environment" }
  }
  const platformKey = process.env[keyName]
  if (!platformKey || !(await isFlagEnabled("platformModelKey", workspaceId))) {
    throw new ModelKeyMissingError(keyName)
  }
  const since = new Date(Date.now() - DAY_MS)
  const [steps, assistant] = await Promise.all([
    repositories.executionStep.sumWorkspaceTokensSince(db, workspaceId, since),
    repositories.assistantUsage.sumAssistantTokensSince(db, workspaceId, since),
  ])
  assertPlatformKeyBudget(steps + assistant)
  return { apiKey: platformKey, source: "platform" }
}
