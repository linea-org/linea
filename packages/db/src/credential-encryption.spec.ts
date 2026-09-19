import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  decryptCredential,
  encryptCredential,
  type CredentialEncryptionContext,
} from "./credential-encryption.js"

const context: CredentialEncryptionContext = {
  workspaceId: "workspace-one",
  applicationId: "application-one",
  externalSubjectId: "subject-one",
  recordId: "connection-one",
  provider: "test",
}

describe("credential encryption", () => {
  beforeEach(() => {
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = "v1"
    process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
      v1: Buffer.alloc(32, 1).toString("base64"),
    })
  })

  afterEach(() => {
    delete process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY
    delete process.env.CONNECTION_CREDENTIAL_KEYS
  })

  it("fails closed when ciphertext is substituted into another context", () => {
    const encrypted = encryptCredential("secret", context)
    expect(() =>
      decryptCredential(encrypted, {
        ...context,
        applicationId: "application-two",
      })
    ).toThrow()
  })

  it("fails closed when ciphertext is tampered with", () => {
    const encrypted = encryptCredential("secret", context)
    const last = encrypted.at(-1)
    const tampered = `${encrypted.slice(0, -1)}${last === "a" ? "b" : "a"}`
    expect(() => decryptCredential(tampered, context)).toThrow()
  })

  it("decrypts an older envelope after the active key rotates", () => {
    const encrypted = encryptCredential("secret", context)
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = "v2"
    process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
      v1: Buffer.alloc(32, 1).toString("base64"),
      v2: Buffer.alloc(32, 2).toString("base64"),
    })
    expect(decryptCredential(encrypted, context)).toBe("secret")
    expect(encryptCredential("new-secret", context).startsWith("v2.")).toBe(
      true
    )
  })
})
