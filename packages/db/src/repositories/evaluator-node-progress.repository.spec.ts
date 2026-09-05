import { describe, expect, it } from "vitest"
import { createExecution, startExecution } from "./execution.repository.js"
import {
  getEvaluatorMetricSteps,
  saveEvaluatorMetricSteps,
} from "./evaluator-metric-steps.repository.js"
import {
  getEvaluatorNodeProgress,
  saveEvaluatorNodeProgress,
} from "./evaluator-node-progress.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

const farFuture = new Date(Date.now() + 60 * 60 * 1000)

describe("Evaluator progress", () => {
  it("saves resumable progress while the caller owns the execution lease", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(tx, execution.id, "worker-1", farFuture)
      const saved = await saveEvaluatorNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "evaluator-1",
        leasedBy: "worker-1",
        state: {
          version: 1,
          metrics: {
            correctness: {
              revision: 1,
              steps: ["Check the answer."],
              tokensInput: 5,
              tokensOutput: 2,
            },
          },
        },
        tokensInput: 5,
        tokensOutput: 2,
      })
      const progress = await getEvaluatorNodeProgress(
        tx,
        execution.id,
        "evaluator-1"
      )
      expect(saved).toBe(true)
      expect(progress?.state.metrics.correctness?.steps).toEqual([
        "Check the answer.",
      ])
      expect(progress?.tokensInput).toBe(5)
    })
  })

  it("rejects progress written by a caller that lost the lease", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(tx, execution.id, "worker-2", farFuture)
      const saved = await saveEvaluatorNodeProgress(tx, {
        executionId: execution.id,
        nodeId: "evaluator-1",
        leasedBy: "worker-1",
        state: { version: 1, metrics: {} },
        tokensInput: 0,
        tokensOutput: 0,
      })
      expect(saved).toBe(false)
      expect(
        await getEvaluatorNodeProgress(tx, execution.id, "evaluator-1")
      ).toBeUndefined()
    })
  })

  it("reuses generated steps within one workflow version", async () => {
    await withRollback(async (tx) => {
      const { version } = await createTestFixtures(tx)
      const key = {
        workflowVersionId: version.id,
        nodeId: "evaluator-1",
        metricId: "correctness",
        metricRevision: 1,
      }
      await saveEvaluatorMetricSteps(tx, {
        ...key,
        steps: ["Compare the response with the expected output."],
      })
      const reused = await saveEvaluatorMetricSteps(tx, {
        ...key,
        steps: ["A concurrent result that must not replace the first."],
      })
      const cached = await getEvaluatorMetricSteps(tx, key)
      expect(reused).toEqual(["Compare the response with the expected output."])
      expect(cached?.steps).toEqual([
        "Compare the response with the expected output.",
      ])
    })
  })
})
