import { describe, expect, it } from "vitest"
import {
  getOrCreateWorkspaceSettings,
  updateWorkspaceSettings,
} from "./workspace-settings.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("getOrCreateWorkspaceSettings", () => {
  it("materializes a default (off) row on first read, and returns the same row on a later read", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)

      const first = await getOrCreateWorkspaceSettings(tx, organization.id)
      expect(first.behaviourAnalysisEnabled).toBe(false)
      expect(first.behaviourSampleRate).toBe(1)

      const second = await getOrCreateWorkspaceSettings(tx, organization.id)
      expect(second.workspaceId).toBe(first.workspaceId)
      expect(second.createdAt.getTime()).toBe(first.createdAt.getTime())
    })
  })
})

describe("updateWorkspaceSettings", () => {
  it("upserts even when no row exists yet, and only touches the given fields", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)

      const enabled = await updateWorkspaceSettings(tx, organization.id, {
        behaviourAnalysisEnabled: true,
        behaviourSampleRate: 0.5,
      })
      expect(enabled.behaviourAnalysisEnabled).toBe(true)
      expect(enabled.behaviourSampleRate).toBe(0.5)
      expect(enabled.behaviourModel).toBeNull()

      const modelSet = await updateWorkspaceSettings(tx, organization.id, {
        behaviourModel: "claude-sonnet-5",
      })
      expect(modelSet.behaviourAnalysisEnabled).toBe(true)
      expect(modelSet.behaviourSampleRate).toBe(0.5)
      expect(modelSet.behaviourModel).toBe("claude-sonnet-5")
    })
  })

  it("rejects a behaviourSampleRate outside [0, 1]", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)

      await expect(
        updateWorkspaceSettings(tx, organization.id, {
          behaviourSampleRate: 1.5,
        })
      ).rejects.toThrow("behaviourSampleRate must be between 0 and 1")

      await expect(
        updateWorkspaceSettings(tx, organization.id, {
          behaviourSampleRate: -0.1,
        })
      ).rejects.toThrow("behaviourSampleRate must be between 0 and 1")
    })
  })
})
