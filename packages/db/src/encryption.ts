import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16

function getKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is required to encrypt or decrypt secrets"
    )
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key)"
    )
  }
  return key
}

function decodePart(value: string | undefined): Buffer | undefined {
  if (!value) return undefined
  try {
    return Buffer.from(value, "base64")
  } catch {
    return undefined
  }
}

/** True only for this module's own iv:authTag:ciphertext format with full-length parts — lets a caller tell a real encrypted value apart from a legacy plaintext one without risking a false positive on a short/malformed tag. */
export function isEncryptedSecret(value: string): boolean {
  const [ivB64, authTagB64, ciphertextB64] = value.split(":")
  if (!ivB64 || !authTagB64 || !ciphertextB64) return false
  const iv = decodePart(ivB64)
  const authTag = decodePart(authTagB64)
  return (
    iv?.length === IV_LENGTH_BYTES && authTag?.length === AUTH_TAG_LENGTH_BYTES
  )
}

// Stored as base64(iv):base64(authTag):base64(ciphertext), self-contained — no separate columns needed, and a fresh random iv per call keeps identical plaintexts from producing identical ciphertext.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64"))
    .join(":")
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":")
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret")
  }
  const authTag = decodePart(authTagB64)
  if (authTag?.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error("Malformed encrypted secret: invalid authentication tag")
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  )
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ])
  return plaintext.toString("utf8")
}
