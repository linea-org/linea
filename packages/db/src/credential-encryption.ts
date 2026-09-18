import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export type CredentialEncryptionContext = {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
  recordId: string
  provider: string
}

function keyRing(): { active: string; keys: Record<string, Buffer> } {
  const active = process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY
  const serialized = process.env.CONNECTION_CREDENTIAL_KEYS
  if (!active || !serialized) {
    throw new Error(
      "CONNECTION_CREDENTIAL_ACTIVE_KEY and CONNECTION_CREDENTIAL_KEYS are required"
    )
  }
  let configured: unknown
  try {
    configured = JSON.parse(serialized)
  } catch {
    throw new Error("CONNECTION_CREDENTIAL_KEYS must be valid JSON")
  }
  if (
    !configured ||
    typeof configured !== "object" ||
    Array.isArray(configured)
  ) {
    throw new Error("CONNECTION_CREDENTIAL_KEYS must be a key object")
  }
  const keys: Record<string, Buffer> = {}
  for (const [version, encoded] of Object.entries(configured)) {
    if (typeof encoded !== "string") {
      throw new TypeError(`Credential key ${version} must be base64 encoded`)
    }
    const key = Buffer.from(encoded, "base64")
    if (key.length !== 32) {
      throw new Error(`Credential key ${version} must decode to 32 bytes`)
    }
    keys[version] = key
  }
  if (!keys[active]) {
    throw new Error("CONNECTION_CREDENTIAL_ACTIVE_KEY is not in the key ring")
  }
  return { active, keys }
}

function associatedData(context: CredentialEncryptionContext): Buffer {
  return Buffer.from(
    JSON.stringify([
      context.workspaceId,
      context.applicationId,
      context.externalSubjectId,
      context.recordId,
      context.provider,
    ]),
    "utf8"
  )
}

export function encryptCredential(
  plaintext: string,
  context: CredentialEncryptionContext
): string {
  const ring = keyRing()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", ring.keys[ring.active], iv)
  cipher.setAAD(associatedData(context))
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  return [
    ring.active,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".")
}

export function decryptCredential(
  encrypted: string,
  context: CredentialEncryptionContext
): string {
  const [version, ivValue, tagValue, ciphertextValue, extra] =
    encrypted.split(".")
  if (!version || !ivValue || !tagValue || !ciphertextValue || extra) {
    throw new Error("Malformed encrypted credential")
  }
  const key = keyRing().keys[version]
  if (!key) throw new Error(`Unknown credential key version: ${version}`)
  const iv = Buffer.from(ivValue, "base64url")
  const tag = Buffer.from(tagValue, "base64url")
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Malformed encrypted credential")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAAD(associatedData(context))
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
