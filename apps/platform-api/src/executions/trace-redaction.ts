import RE2 from 're2'

export const REDACTED = '[redacted]'

/** Environment secret values to replace wherever they appear, keyed by secret name. */
export type KnownSecrets = ReadonlyMap<string, string>

// Shorter values would match ordinary words and numbers.
const MIN_SECRET_LENGTH = 8

const credentialKey =
  /(^|_)(authorization|cookie|password|passwd|secret|token|api_?key|private_?key|credential)s?$/

const credentials: [RegExp, string][] = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    REDACTED,
  ],
  [
    /\b(Bearer|Basic)[\s\p{Z}\v\ufeff]+[a-z0-9._~+/=-]{8,}/giu,
    `$1 ${REDACTED}`,
  ],
  [/(:\/\/)[^\s/:@]+:[^\s/@]+@/g, `$1${REDACTED}@`],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, REDACTED],
  [/\b(sk|gsk|xai)-[\w-]{20,}/g, REDACTED],
  [/\bgsk_\w{20,}/g, REDACTED],
  [/\b(gh[pousr]_\w{20,}|github_pat_\w{20,})/g, REDACTED],
  [/\bxox[abprs]-[\w-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
]

// RE2, because anyone can choose the text a run page matches, and the time must stay linear.
const credentialPatterns = credentials.map(
  ([pattern, replacement]): [RE2, string] => [new RE2(pattern), replacement],
)

function isCredentialKey(key: string) {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-.\s]/g, '_')
    .toLowerCase()
  return credentialKey.test(normalized)
}

export function redactText(text: string, secrets: KnownSecrets): string {
  let redacted = text
  for (const [name, value] of secrets) {
    if (value.length >= MIN_SECRET_LENGTH)
      redacted = redacted.replaceAll(value, `[secret ${name}]`)
  }
  for (const [pattern, replacement] of credentialPatterns) {
    redacted = redacted.replace(pattern, replacement)
  }
  return redacted
}

function redactCredential(value: unknown): unknown {
  if (typeof value === 'string') return value === '' ? value : REDACTED
  if (Array.isArray(value)) return value.map(redactCredential)
  return value
}

/** Replaces credentials in recorded JSON: strings under credential-named keys, and known secret
 * values and recognisable tokens anywhere. Strings, arrays and scalars keep their shape. */
export function redactValue(value: unknown, secrets: KnownSecrets): unknown {
  if (typeof value === 'string') return redactText(value, secrets)
  if (Array.isArray(value))
    return value.map((item) => redactValue(item, secrets))
  if (typeof value === 'object' && value !== null)
    return redactRecord(value, secrets)
  return value
}

export function redactRecord(
  record: object,
  secrets: KnownSecrets,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      isCredentialKey(key)
        ? redactCredential(redactValue(value, secrets))
        : redactValue(value, secrets),
    ]),
  )
}

const placeholder = /\[redacted\]|\[secret [^\]\s]+\]/

export function containsRedactionPlaceholder(value: unknown): boolean {
  return placeholder.test(JSON.stringify(value))
}
