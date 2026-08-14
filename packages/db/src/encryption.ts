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

const BASE64_PART_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

/** True for anything shaped like this module's iv:authTag:ciphertext format, regardless of whether the part lengths are actually correct — a real encrypted value that's been corrupted (e.g. a truncated auth tag) still matches this. Used to tell "corrupted encrypted secret" apart from "genuinely opaque legacy plaintext" so the former can be rejected instead of silently used as a literal API key. */
function looksLikeEncryptedSecret(value: string): boolean {
  const parts = value.split(":")
  return (
    parts.length === 3 && parts.every((part) => BASE64_PART_PATTERN.test(part))
  )
}

/** True only for this module's own iv:authTag:ciphertext format with full-length parts — lets a caller tell a real, decryptable encrypted value apart from a legacy plaintext one. A value that merely looks like this format but has the wrong part lengths (corrupted, not legacy) returns false here too; use looksLikeEncryptedSecret to distinguish that case from true legacy plaintext. */
export function isEncryptedSecret(value: string): boolean {
  if (!looksLikeEncryptedSecret(value)) return false
  const [ivB64, authTagB64] = value.split(":")
  const iv = decodePart(ivB64)
  const authTag = decodePart(authTagB64)
  return (
    iv?.length === IV_LENGTH_BYTES && authTag?.length === AUTH_TAG_LENGTH_BYTES
  )
}

/** True for a value that's shaped like an encrypted secret but fails full validation — a corrupted encrypted value, not a legacy plaintext one. Callers should reject these rather than using them as-is. */
export function isCorruptedEncryptedSecret(value: string): boolean {
  return looksLikeEncryptedSecret(value) && !isEncryptedSecret(value)
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
