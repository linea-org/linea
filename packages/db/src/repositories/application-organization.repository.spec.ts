import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { organizations } from "../schema/index.js"
import {
  createApplication,
  getApplicationById,
} from "./application.repository.js"
import { listEnvironments } from "./environment.repository.js"
import { withRollback } from "./test-utils.js"

describe("Application organization", () => {
  it("creates a product with isolated Development and Production Environments", async () => {
    await withRollback(async (tx) => {
      const [workspace] = await tx
        .insert(organizations)
        .values({ name: "Acme", slug: randomUUID(), createdAt: new Date() })
        .returning()
      const application = await createApplication(tx, {
        workspaceId: workspace.id,
        name: "Support assistant",
        slug: "support-assistant",
      })
      const environments = await listEnvironments(
        tx,
        workspace.id,
        application.id
      )
      expect(application.name).toBe("Support assistant")
      expect(environments.map(({ environment }) => environment).sort()).toEqual(
        ["dev", "production"]
      )
      expect(new Set(environments.map(({ id }) => id)).size).toBe(2)
      expect(
        environments.every(
          ({ applicationId }) => applicationId === application.id
        )
      ).toBe(true)
      expect(
        await getApplicationById(tx, randomUUID(), application.id)
      ).toBeUndefined()
      expect(await listEnvironments(tx, randomUUID(), application.id)).toEqual(
        []
      )
    })
  })
})
