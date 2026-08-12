import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { executionSteps } from "../schema/index.js"
import { createExecution } from "./execution.repository.js"
import {
  createFlagIfNew,
  detectCostJump,
  detectExcessResumes,
  detectRetryStorm,
  getObservedBranchValues,
  getWorkflowIdsWithBranchSteps,
} from "./flag.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function insertStep(
  tx: Transaction,
  overrides: Partial<typeof executionSteps.$inferInsert> &
    Pick<typeof executionSteps.$inferInsert, "executionId" | "workspaceId">
) {
  const [step] = await tx
    .insert(executionSteps)
    .values({
      traceId: overrides.executionId,
      spanId: randomUUID(),
      name: "ai",
      nodeId: "n1",
      sequence: 1,
      startedAt: new Date(),
      status: "succeeded",
      ...overrides,
    })
    .returning()
  return step
}

describe("detectRetryStorm", () => {
  it("flags a node whose max attempt meets the threshold, ignores one below it", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "stormy",
        attempt: 3,
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "calm",
        attempt: 1,
      })

      const results = await detectRetryStorm(tx, 3)
      expect(results).toEqual([
        expect.objectContaining({
          executionId: execution.id,
          nodeId: "stormy",
          maxAttempt: 3,
        }),
      ])
    })
  })
})

describe("detectExcessResumes", () => {
  it("flags an execution with more than the threshold of resume markers", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      for (let i = 0; i < 3; i++) {
        await insertStep(tx, {
          executionId: execution.id,
          workspaceId: organization.id,
          nodeId: "__resumed__",
          name: "resumed",
          isSystemEvent: true,
          sequence: -(i + 1),
        })
      }

      const results = await detectExcessResumes(tx, 2)
      expect(results).toEqual([
        expect.objectContaining({
          executionId: execution.id,
          resumeCount: 3,
        }),
      ])
    })
  })

  it("does not flag an execution at or under the threshold", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "__resumed__",
        name: "resumed",
        isSystemEvent: true,
        sequence: -1,
      })

      const results = await detectExcessResumes(tx, 2)
      expect(results).toEqual([])
    })
  })
})

describe("detectCostJump", () => {
  it("flags a step costing an order of magnitude above its node's own history, once enough samples exist", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)

      // Three prior executions of the same workflow, all costing about the same for "n1".
      for (let i = 0; i < 3; i++) {
        const execution = await createExecution(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
        })
        await insertStep(tx, {
          executionId: execution.id,
          workspaceId: organization.id,
          nodeId: "n1",
          costMicros: 100n,
        })
      }

      // A fourth execution whose "n1" step costs far more than its own history.
      const spikedExecution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await insertStep(tx, {
        executionId: spikedExecution.id,
        workspaceId: organization.id,
        nodeId: "n1",
        costMicros: 5000n,
      })

      const results = await detectCostJump(tx, 10, 3)
      expect(results).toEqual([
        expect.objectContaining({
          executionId: spikedExecution.id,
          nodeId: "n1",
        }),
      ])
    })
  })

  it("does not flag a node with fewer samples than the minimum", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "n1",
        costMicros: 5000n,
      })

      const results = await detectCostJump(tx, 10, 3)
      expect(results).toEqual([])
    })
  })
})

describe("getWorkflowIdsWithBranchSteps and getObservedBranchValues", () => {
  it("finds workflows with branch steps and the branch values actually observed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "b1",
        name: "branch",
        output: { branch: "yes" },
      })

      const withBranches = await getWorkflowIdsWithBranchSteps(tx)
      expect(withBranches).toContainEqual({
        workflowId: workflow.id,
        workspaceId: organization.id,
      })

      const observed = await getObservedBranchValues(tx, workflow.id, "b1")
      expect(observed).toEqual(new Set(["yes"]))
    })
  })
})

describe("createFlagIfNew", () => {
  it("inserts once and silently no-ops on a repeated dedupe key", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const dedupeKey = `test:${randomUUID()}`

      const first = await createFlagIfNew(tx, {
        workspaceId: organization.id,
        flagType: "retry_storm",
        dedupeKey,
      })
      expect(first).toBeDefined()

      const second = await createFlagIfNew(tx, {
        workspaceId: organization.id,
        flagType: "retry_storm",
        dedupeKey,
      })
      expect(second).toBeUndefined()
    })
  })
})
