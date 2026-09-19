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
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        throw new Error("I-JSON strings must contain valid Unicode")
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error("I-JSON strings must contain valid Unicode")
    }
  }
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
  const keys = Object.keys(object).sort()
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
