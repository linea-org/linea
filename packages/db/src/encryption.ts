import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH_BYTES = 12

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
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  )
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ])
  return plaintext.toString("utf8")
}
