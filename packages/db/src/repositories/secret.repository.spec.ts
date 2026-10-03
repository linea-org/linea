import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { organizations } from "../schema/index.js"
import { createApplication } from "./application.repository.js"
import { listEnvironments } from "./environment.repository.js"
import {
  deleteSecret,
  getSecret,
  listSecrets,
  upsertSecret,
} from "./secret.repository.js"
import { withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function fixture(tx: Transaction) {
  const [workspace] = await tx
    .insert(organizations)
    .values({ name: "Secrets", slug: randomUUID(), createdAt: new Date() })
    .returning()
  const application = await createApplication(tx, {
    workspaceId: workspace.id,
    name: "Support",
    slug: "support",
  })
  const targets = await listEnvironments(tx, workspace.id, application.id)
  const development = targets.find(
    (environment) => environment.environment === "dev"
  )
  const production = targets.find(
    (environment) => environment.environment === "production"
  )
  if (!development || !production)
    throw new Error("Application Environments missing")
  return { workspace, application, development, production }
}

describe("Environment secrets", () => {
  it("isolates the same secret name between Development and Production", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      await upsertSecret(tx, f.development.id, "API_KEY", "development-cipher")
      await upsertSecret(tx, f.production.id, "API_KEY", "production-cipher")
      expect(await getSecret(tx, f.development.id, "API_KEY")).toMatchObject({
        encryptedValue: "development-cipher",
      })
      expect(await getSecret(tx, f.production.id, "API_KEY")).toMatchObject({
        encryptedValue: "production-cipher",
      })
      const original = await getSecret(tx, f.development.id, "API_KEY")
      await upsertSecret(tx, f.development.id, "API_KEY", "rotated-cipher")
      expect(await getSecret(tx, f.development.id, "API_KEY")).toMatchObject({
        id: original?.id,
        encryptedValue: "rotated-cipher",
      })
      expect(await getSecret(tx, f.production.id, "API_KEY")).toMatchObject({
        encryptedValue: "production-cipher",
      })
    })
  })
  it("lists metadata without ciphertext and deletes only the selected Environment", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      for (const target of [f.development, f.production])
        await upsertSecret(tx, target.id, "API_KEY", "cipher")
      const list = await listSecrets(tx, f.development.id)
      expect(list.map((secret) => secret.key)).toEqual(["API_KEY"])
      expect(list.every((secret) => !("encryptedValue" in secret))).toBe(true)
      expect(await deleteSecret(tx, f.development.id, "API_KEY")).toMatchObject(
        { key: "API_KEY" }
      )
      expect(
        await deleteSecret(tx, f.development.id, "API_KEY")
      ).toBeUndefined()
      expect(await getSecret(tx, f.production.id, "API_KEY")).toBeDefined()
    })
  })
  it("does not share secrets with another Application in the same Workspace", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const other = await createApplication(tx, {
        workspaceId: f.workspace.id,
        name: "Other",
        slug: "other",
      })
      const [environment] = await listEnvironments(tx, f.workspace.id, other.id)
      await upsertSecret(tx, f.development.id, "API_KEY", "cipher")
      expect(await getSecret(tx, environment.id, "API_KEY")).toBeUndefined()
      expect(await listSecrets(tx, environment.id)).toEqual([])
      expect(await deleteSecret(tx, environment.id, "API_KEY")).toBeUndefined()
    })
  })
})
