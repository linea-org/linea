import { describe, expect, it } from "vitest"
import { assistantUsage } from "../schema/index.js"
import {
  recordAssistantUsage,
  sumAssistantTokensSince,
} from "./assistant-usage.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("sumAssistantTokensSince", () => {
  it("adds recorded assistant tokens inside the window only", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const since = new Date(Date.now() - 86_400_000)
      await recordAssistantUsage(tx, organization.id, 300)
      await recordAssistantUsage(tx, organization.id, 200)
      await tx.insert(assistantUsage).values({
        workspaceId: organization.id,
        tokens: 1000,
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      })
      expect(await sumAssistantTokensSince(tx, organization.id, since)).toBe(
        500
      )
    })
  })
})
