import { providers } from "@linealabs/ai"
import {
  db,
  decryptSecret,
  isEncryptedSecret,
  repositories,
} from "@linealabs/db"
import { NonRetryableError } from "./nodes/non-retryable-error"

/** Reads a secret to send outside Linea, so it refuses the model provider keys. */
export async function loadSecret(
  environmentId: string,
  name: string,
  reader: string
): Promise<string> {
  if (providers.some((provider) => provider.keyName === name)) {
    throw new NonRetryableError(
      `${reader} can't be sent the model key "${name}"`
    )
  }
  const secret = await repositories.secret.getSecret(db, environmentId, name)
  if (!secret) {
    throw new NonRetryableError(
      `${reader} needs the secret "${name}", which isn't set in this Environment`
    )
  }
  if (!isEncryptedSecret(secret.encryptedValue)) {
    throw new NonRetryableError(
      `${reader} can't be sent the secret "${name}", which is not encrypted`
    )
  }
  return decryptSecret(secret.encryptedValue)
}
