import { describe, expect, it } from "vitest"
import { createExecution } from "./execution.repository.js"
import {
  getLatestCheckpoint,
  getStepsForExecution,
  writeStepAndCheckpoint,
} from "./checkpoint.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("writeStepAndCheckpoint", () => {
  it("writes the step and the checkpoint together", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const { step, checkpoint } = await writeStepAndCheckpoint(tx, {
        step: {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-1",
          name: "http",
          startedAt: new Date(),
          status: "succeeded",
          nodeId: "node-1",
          sequence: 1,
        },
        checkpoint: {
          sequence: 1,
          completedStepIds: ["node-1"],
          context: { "node-1": { status: 200 } },
        },
      })

      expect(step.executionId).toBe(execution.id)
      expect(checkpoint.executionId).toBe(execution.id)

      const latest = await getLatestCheckpoint(tx, execution.id)
      expect(latest?.sequence).toBe(1)

      const steps = await getStepsForExecution(tx, execution.id)
      expect(steps).toHaveLength(1)
      expect(steps[0].nodeId).toBe("node-1")
    })
  })

  it("returns the most recent checkpoint when several exist", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      for (const sequence of [1, 2, 3]) {
        await writeStepAndCheckpoint(tx, {
          step: {
            executionId: execution.id,
            workspaceId: organization.id,
            traceId: execution.id,
            spanId: `span-${sequence}`,
            name: "http",
            startedAt: new Date(),
            status: "succeeded",
            nodeId: `node-${sequence}`,
            sequence,
          },
          checkpoint: {
            sequence,
            completedStepIds: [`node-${sequence}`],
            context: {},
          },
        })
      }

      const latest = await getLatestCheckpoint(tx, execution.id)
      expect(latest?.sequence).toBe(3)
    })
  })

  it("rejects a step whose workspaceId does not match its execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const { organization: otherOrg } = await createTestFixtures(tx)

      await expect(
        writeStepAndCheckpoint(tx, {
          step: {
            executionId: execution.id,
            workspaceId: otherOrg.id,
            traceId: execution.id,
            spanId: "span-1",
            name: "http",
            startedAt: new Date(),
            status: "succeeded",
            nodeId: "node-1",
            sequence: 1,
          },
          checkpoint: { sequence: 1, completedStepIds: [], context: {} },
        })
      ).rejects.toThrow()
    })
  })
})
