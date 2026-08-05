import { createHash, randomBytes } from 'node:crypto'

const KEY_PREFIX = 'lin_'
const PREFIX_DISPLAY_LENGTH = 12

export type GeneratedApiKey = {
  rawKey: string
  hashedKey: string
  keyPrefix: string
}

/** The raw key is only ever available here — callers must show it once and store only the hash. */
export function generateApiKey(): GeneratedApiKey {
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`
  return {
    rawKey,
    hashedKey: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, PREFIX_DISPLAY_LENGTH),
  }
}

/** Deterministic (not bcrypt/argon2) since lookup needs an exact-match query, not a per-attempt comparison. */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}
