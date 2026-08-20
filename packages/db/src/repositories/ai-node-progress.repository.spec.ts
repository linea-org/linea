import { describe, expect, it } from "vitest"
import { createExecution, startExecution } from "./execution.repository.js"
import {
  getAiNodeProgress,
  saveAiNodeProgress,
} from "./ai-node-progress.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

const farFuture = new Date(Date.now() + 60 * 60 * 1000)

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
      await startExecution(tx, execution.id, "worker-1", farFuture)

      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
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

  it("overwrites the prior row on a second save while the same worker still holds the lease", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(tx, execution.id, "worker-1", farFuture)

      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        conversation: [{ role: "user", content: "first" }],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })
      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
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

  it("does not overwrite newer progress once another worker has reclaimed the execution's lease", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1000)
      )

      // worker-1's provider call is still in flight when its lease expires and worker-2 reclaims it.
      await startExecution(tx, execution.id, "worker-2", farFuture)
      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-2",
        conversation: [{ role: "user", content: "from worker-2" }],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })

      // worker-1's call finally resolves and it tries to save under its now-stale ownership.
      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        conversation: [{ role: "user", content: "from stale worker-1" }],
        iteration: 5,
        tokensInput: 99,
        tokensOutput: 99,
      })

      const progress = await getAiNodeProgress(tx, execution.id, "ai-1")

      expect(progress?.conversation).toEqual([
        { role: "user", content: "from worker-2" },
      ])
      expect(progress?.iteration).toBe(1)
    })
  })

  it("does not create a row at all when the caller's lease was already lost before the first save", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      // worker-1's lease expired and worker-2 reclaimed it before worker-1's first save landed —
      // no row exists yet, so this must be caught on the insert path, not just a later overwrite.
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1000)
      )
      await startExecution(tx, execution.id, "worker-2", farFuture)

      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        conversation: [{ role: "user", content: "from stale worker-1" }],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })

      const progress = await getAiNodeProgress(tx, execution.id, "ai-1")

      expect(progress).toBeUndefined()
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
      await startExecution(tx, execution.id, "worker-1", farFuture)

      await saveAiNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
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
