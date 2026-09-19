import { createHash } from "node:crypto"

export type IJsonValue =
  | null
  | boolean
  | number
  | string
  | IJsonValue[]
  | { [key: string]: IJsonValue }

export const ACTION_INTENT_DIGEST_VERSION = "jcs-sha256-v1"

function assertUnicodeScalarValue(value: string): void {
  if (/[\uD800-\uDFFF]/u.test(value)) {
    throw new Error("I-JSON strings must contain valid Unicode")
  }
}

function compareUtf16CodeUnits(left: string, right: string): number {
  // RFC 8785 requires raw UTF-16 ordering, which localeCompare does not provide.
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function canonicalizeValue(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("I-JSON numbers must be finite")
    return JSON.stringify(value)
  }
  if (typeof value === "string") {
    assertUnicodeScalarValue(value)
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(",")}]`
  }
  if (typeof value !== "object" || value === undefined) {
    throw new Error("Value is not I-JSON compatible")
  }
  const prototype = Reflect.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("I-JSON objects must be plain objects")
  }
  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort(compareUtf16CodeUnits)
  return `{${keys
    .map((key) => {
      assertUnicodeScalarValue(key)
      return `${JSON.stringify(key)}:${canonicalizeValue(object[key])}`
    })
    .join(",")}}`
}

export function canonicalizeActionIntent(value: unknown): string {
  return canonicalizeValue(value)
}

export function digestActionIntent(value: unknown): string {
  return createHash("sha256")
    .update(canonicalizeActionIntent(value), "utf8")
    .digest("base64url")
}
