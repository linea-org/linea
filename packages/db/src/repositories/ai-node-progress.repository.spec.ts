import { describe, expect, it } from "vitest"
import { createExecution } from "./execution.repository.js"
import {
  getAiNodeProgress,
  saveAiNodeProgress,
} from "./ai-node-progress.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("saveAiNodeProgress / getAiNodeProgress", () => {
  it("returns undefined when no progress has been saved yet", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const progress = await getAiNodeProgress(tx, execution.id, "ai-1")

      expect(progress).toBeUndefined()
    })
  })

  it("returns the saved conversation, iteration, and token counts", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        conversation: [{ role: "user", content: "hi" }],
        iteration: 1,
        tokensInput: 5,
        tokensOutput: 2,
      })

      const progress = await getAiNodeProgress(tx, execution.id, "ai-1")

      expect(progress?.conversation).toEqual([{ role: "user", content: "hi" }])
      expect(progress?.iteration).toBe(1)
      expect(progress?.tokensInput).toBe(5)
      expect(progress?.tokensOutput).toBe(2)
    })
  })

  it("overwrites the prior row on a second save for the same execution+node", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        conversation: [{ role: "user", content: "first" }],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })
      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        conversation: [{ role: "user", content: "second" }],
        iteration: 2,
        tokensInput: 3,
        tokensOutput: 4,
      })

      const progress = await getAiNodeProgress(tx, execution.id, "ai-1")

      expect(progress?.conversation).toEqual([
        { role: "user", content: "second" },
      ])
      expect(progress?.iteration).toBe(2)
    })
  })

  it("keeps progress for different nodes in the same execution separate", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        conversation: [{ role: "user", content: "node one" }],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })

      const otherNode = await getAiNodeProgress(tx, execution.id, "ai-2")

      expect(otherNode).toBeUndefined()
    })
  })
})
