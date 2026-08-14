import { randomBytes } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import {
  decryptSecret,
  encryptSecret,
  isCorruptedEncryptedSecret,
  isEncryptedSecret,
} from "./encryption.js"

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64")
})

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", () => {
    const encrypted = encryptSecret("sk-super-secret-value")
    expect(encrypted).not.toContain("sk-super-secret-value")
    expect(decryptSecret(encrypted)).toBe("sk-super-secret-value")
  })

  it("produces different ciphertext for the same plaintext each time", () => {
    const first = encryptSecret("same-value")
    const second = encryptSecret("same-value")
    expect(first).not.toBe(second)
    expect(decryptSecret(first)).toBe("same-value")
    expect(decryptSecret(second)).toBe("same-value")
  })

  it("fails to decrypt with the wrong key", () => {
    const encrypted = encryptSecret("sensitive")
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64")
    expect(() => decryptSecret(encrypted)).toThrow()
  })

  it("throws a clear error when the key is missing", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    expect(() => encryptSecret("value")).toThrow(/SECRETS_ENCRYPTION_KEY/)
  })

  it("throws a clear error when the key is not 32 bytes", () => {
    process.env.SECRETS_ENCRYPTION_KEY =
      Buffer.from("too-short").toString("base64")
    expect(() => encryptSecret("value")).toThrow(/32 bytes/)
  })

  it("rejects a stored value with a truncated authentication tag", () => {
    const encrypted = encryptSecret("sensitive")
    const [iv, authTag, ciphertext] = encrypted.split(":")
    const shortTag = Buffer.from(authTag, "base64")
      .subarray(0, 8)
      .toString("base64")
    const tampered = [iv, shortTag, ciphertext].join(":")
    expect(() => decryptSecret(tampered)).toThrow(/authentication tag/)
  })
})

describe("isEncryptedSecret", () => {
  it("is true for a value produced by encryptSecret", () => {
    expect(isEncryptedSecret(encryptSecret("value"))).toBe(true)
  })

  it("is false for plain text, including plain text that happens to contain colons", () => {
    expect(isEncryptedSecret("sk-plain-key")).toBe(false)
    expect(isEncryptedSecret("not:encrypted:either")).toBe(false)
  })

  it("is false for a value with a truncated authentication tag", () => {
    const encrypted = encryptSecret("value")
    const [iv, authTag, ciphertext] = encrypted.split(":")
    const shortTag = Buffer.from(authTag, "base64")
      .subarray(0, 8)
      .toString("base64")
    expect(isEncryptedSecret([iv, shortTag, ciphertext].join(":"))).toBe(false)
  })
})

describe("isCorruptedEncryptedSecret", () => {
  it("is true for a value with a truncated authentication tag", () => {
    const encrypted = encryptSecret("value")
    const [iv, authTag, ciphertext] = encrypted.split(":")
    const shortTag = Buffer.from(authTag, "base64")
      .subarray(0, 8)
      .toString("base64")
    expect(
      isCorruptedEncryptedSecret([iv, shortTag, ciphertext].join(":"))
    ).toBe(true)
  })

  it("is false for a fully valid encrypted value", () => {
    expect(isCorruptedEncryptedSecret(encryptSecret("value"))).toBe(false)
  })

  it("is false for plaintext that doesn't resemble the encrypted format", () => {
    expect(isCorruptedEncryptedSecret("sk-plain-key")).toBe(false)
  })
})
