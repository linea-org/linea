import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { executionSteps } from "../schema/index.js"
import { createExecution } from "./execution.repository.js"
import { createWorkflowVersion } from "./workflow.repository.js"
import {
  createFlagIfNew,
  detectCostJump,
  detectEmptyResponses,
  detectExcessResumes,
  detectRefusals,
  detectRepeatedReplay,
  detectRetryStorm,
  detectToolErrors,
  getObservedBranchValues,
  getWorkflowIdsWithBranchSteps,
} from "./flag.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

// Every detect* function scans the whole executionSteps table by design (a background flagging
// sweep has no single workspace to scope to) — so a test asserting on its raw result is really
// asserting the local dev Postgres this suite runs against currently has no other matching rows,
// which stops being true the moment any other manual testing or a stray prior run has left real
// data behind. Filtering to this test's own execution.id before asserting keeps every test correct
// regardless of what else happens to be sitting in the shared database.
function ownRows<T extends { executionId: string }>(
  rows: T[],
  executionId: string
): T[] {
  return rows.filter((row) => row.executionId === executionId)
}

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
      expect(ownRows(results, execution.id)).toEqual([
        expect.objectContaining({
          executionId: execution.id,
          nodeId: "stormy",
          maxAttempt: 3,
        }),
      ])
    })
  })

  it("ignores synthetic resume markers, whose attempt counts resumes, not node retries", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      // Two resumes already puts a __resumed__ row's attempt at 3 — see recordResumeEvent.
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "__resumed__",
        name: "resumed",
        isSystemEvent: true,
        sequence: -1,
        attempt: 3,
      })

      const results = await detectRetryStorm(tx, 3)
      expect(ownRows(results, execution.id)).toEqual([])
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
      expect(ownRows(results, execution.id)).toEqual([
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
      expect(ownRows(results, execution.id)).toEqual([])
    })
  })
})

describe("detectCostJump", () => {
  it("flags a step costing an order of magnitude above its node's own history, once enough samples exist", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const now = Date.now()

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
          startedAt: new Date(now + i * 1000),
        })
      }

      // A fourth, later execution whose "n1" step costs far more than its own prior history.
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
        startedAt: new Date(now + 4000),
      })

      const results = await detectCostJump(tx, 10, 3)
      expect(ownRows(results, spikedExecution.id)).toEqual([
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
      expect(ownRows(results, execution.id)).toEqual([])
    })
  })

  it("does not let later, cheaper runs retroactively flag an earlier normal-cost run", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const now = Date.now()

      // An older, unremarkable run — first in time, so it has no prior samples of its own.
      const earlyExecution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await insertStep(tx, {
        executionId: earlyExecution.id,
        workspaceId: organization.id,
        nodeId: "n1",
        costMicros: 5000n,
        startedAt: new Date(now),
      })

      // Three later, much cheaper runs — must not pull the earlier run's baseline down after the fact.
      for (let i = 1; i <= 3; i++) {
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
          startedAt: new Date(now + i * 1000),
        })
      }

      const results = await detectCostJump(tx, 10, 3)
      expect(results.some((r) => r.executionId === earlyExecution.id)).toBe(
        false
      )
    })
  })

  it("breaks a startedAt tie by insertion order instead of ordering ties arbitrarily", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const tiedTimestamp = new Date()

      // Inserted first, so it must be treated as "earlier" despite sharing startedAt with what follows.
      const earlyExecution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await insertStep(tx, {
        executionId: earlyExecution.id,
        workspaceId: organization.id,
        nodeId: "n1",
        costMicros: 5000n,
        startedAt: tiedTimestamp,
      })

      // Three more, same startedAt, inserted after — must not count as "prior" to the row above.
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
          startedAt: tiedTimestamp,
        })
      }

      const results = await detectCostJump(tx, 10, 3)
      expect(results.some((r) => r.executionId === earlyExecution.id)).toBe(
        false
      )
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

      const observed = await getObservedBranchValues(tx, version.id, "b1")
      expect(observed).toEqual(new Set(["yes"]))
    })
  })

  it("does not credit a condition observed under a different workflow version", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const otherVersion = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "other-version-hash",
      })
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        // Ran under a different version than the one we're checking.
        workflowVersionId: otherVersion.id,
        trigger: "manual",
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "b1",
        name: "branch",
        output: { branch: "yes" },
      })

      const observed = await getObservedBranchValues(tx, version.id, "b1")
      expect(observed).toEqual(new Set())
    })
  })
})

describe("detectToolErrors", () => {
  it("flags a failed non-ai step, ignores a failed ai step and a succeeded one", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const failedHttp = await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "http-step",
        name: "http",
        status: "failed",
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "ai-step",
        name: "ai",
        status: "failed",
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "ok-step",
        name: "http",
        status: "succeeded",
      })

      const results = await detectToolErrors(tx)
      expect(ownRows(results, execution.id)).toEqual([
        expect.objectContaining({ stepId: failedHttp.id, nodeId: "http-step" }),
      ])
    })
  })
})

describe("detectEmptyResponses", () => {
  it("flags a succeeded ai step with blank text, ignores one with real text", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const blank = await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "blank-step",
        output: { text: "   " },
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "real-step",
        output: { text: "hello" },
      })

      const results = await detectEmptyResponses(tx)
      expect(ownRows(results, execution.id)).toEqual([
        expect.objectContaining({ stepId: blank.id, nodeId: "blank-step" }),
      ])
    })
  })
})

describe("detectRefusals", () => {
  it("flags a refusal phrase case-insensitively, ignores ordinary text", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const refused = await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "refused-step",
        output: { text: "I'm sorry, but I CANNOT help with that request." },
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "ok-step",
        output: { text: "Sure, here's the summary you asked for." },
      })

      const results = await detectRefusals(tx)
      expect(ownRows(results, execution.id)).toEqual([
        expect.objectContaining({ stepId: refused.id, nodeId: "refused-step" }),
      ])
    })
  })
})

describe("detectRepeatedReplay", () => {
  it("flags an original step replayed at least the minimum number of times", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const original = await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "n1",
      })

      for (let i = 0; i < 3; i++) {
        await insertStep(tx, {
          executionId: execution.id,
          workspaceId: organization.id,
          nodeId: "n1",
          replayedFromStepId: original.id,
        })
      }

      const results = await detectRepeatedReplay(tx, 3)
      expect(ownRows(results, execution.id)).toEqual([
        expect.objectContaining({
          executionId: execution.id,
          originalStepId: original.id,
          replayCount: 3,
        }),
      ])
    })
  })

  it("does not flag a step replayed fewer times than the minimum", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const original = await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "n1",
      })
      await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "n1",
        replayedFromStepId: original.id,
      })

      const results = await detectRepeatedReplay(tx, 3)
      expect(ownRows(results, execution.id)).toEqual([])
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
