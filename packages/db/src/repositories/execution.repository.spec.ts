import { describe, expect, it } from "vitest"
import { executions } from "../schema/index.js"
import {
  completeExecution,
  createExecution,
  listExecutions,
  renewLease,
  startExecution,
} from "./execution.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("startExecution", () => {
  it("claims a queued execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const leaseExpiresAt = new Date(Date.now() + 60_000)
      const claimed = await startExecution(
        tx,
        execution.id,
        "worker-1",
        leaseExpiresAt
      )

      expect(claimed?.status).toBe("running")
      expect(claimed?.leasedBy).toBe("worker-1")
    })
  })

  it("does not let a second worker claim an already-running execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const leaseExpiresAt = new Date(Date.now() + 60_000)
      const first = await startExecution(
        tx,
        execution.id,
        "worker-1",
        leaseExpiresAt
      )
      const second = await startExecution(
        tx,
        execution.id,
        "worker-2",
        leaseExpiresAt
      )

      expect(first?.leasedBy).toBe("worker-1")
      expect(second).toBeUndefined()
    })
  })
})

describe("renewLease", () => {
  it("only extends the lease of a running execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      // Still queued — renew should be a no-op, not an error.
      await renewLease(tx, execution.id, new Date(Date.now() + 60_000))

      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 1_000)
      )
      const newExpiry = new Date(Date.now() + 120_000)
      await renewLease(tx, execution.id, newExpiry)

      const [result] = await listExecutions(tx, workflow.id)
      expect(result.leaseExpiresAt?.getTime()).toBe(newExpiry.getTime())
    })
  })
})

describe("completeExecution", () => {
  it("marks an execution succeeded with cost and token totals", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const completed = await completeExecution(tx, execution.id, {
        status: "succeeded",
        costMicros: 1_500n,
        tokensInput: 100,
        tokensOutput: 50,
      })

      expect(completed?.status).toBe("succeeded")
      expect(completed?.costMicros).toBe(1_500n)
      expect(completed?.completedAt).toBeInstanceOf(Date)
    })
  })

  it("does not let a delayed completion overwrite an already-terminal outcome", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const first = await completeExecution(tx, execution.id, {
        status: "succeeded",
        costMicros: 1_500n,
        tokensInput: 100,
        tokensOutput: 50,
      })
      expect(first?.status).toBe("succeeded")

      const late = await completeExecution(tx, execution.id, {
        status: "failed",
        error: { message: "timed out" },
        costMicros: 9_999n,
        tokensInput: 0,
        tokensOutput: 0,
      })
      expect(late).toBeUndefined()

      const [row] = await listExecutions(tx, workflow.id)
      expect(row.status).toBe("succeeded")
      expect(row.costMicros).toBe(1_500n)
    })
  })
})

describe("listExecutions", () => {
  it("orders by most recent first", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      // now() is frozen per-transaction in Postgres — set createdAt explicitly so the inserts don't tie.
      const [first] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          createdAt: new Date(Date.now() - 1_000),
        })
        .returning()
      const [second] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          createdAt: new Date(),
        })
        .returning()

      const results = await listExecutions(tx, workflow.id)
      expect(results.map((e) => e.id)).toEqual([second.id, first.id])
    })
  })
})
