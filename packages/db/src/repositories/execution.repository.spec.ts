import { describe, expect, it } from "vitest"
import { executions } from "../schema/index.js"
import {
  completeExecution,
  createExecution,
  getLeaseOwner,
  listExecutions,
  renewLease,
  startExecution,
} from "./execution.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("getLeaseOwner", () => {
  it("reflects the current owner after a reclaim", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      expect(await getLeaseOwner(tx, execution.id)).toBeNull()

      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1_000)
      )
      expect(await getLeaseOwner(tx, execution.id)).toBe("worker-1")

      await startExecution(
        tx,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )
      expect(await getLeaseOwner(tx, execution.id)).toBe("worker-2")
    })
  })
})

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

  it("does not let a second worker claim a running execution with a live lease", async () => {
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
        new Date(Date.now() + 60_000)
      )
      const second = await startExecution(
        tx,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      expect(second).toBeUndefined()
    })
  })

  it("reclaims a running execution once its lease has expired", async () => {
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
        new Date(Date.now() - 1_000)
      )

      const reclaimed = await startExecution(
        tx,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      expect(reclaimed?.leasedBy).toBe("worker-2")
    })
  })
})

describe("renewLease", () => {
  it("only extends the lease of a running execution owned by the renewing worker", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      // Still queued — renew should be a no-op, not an error.
      await renewLease(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 1_000)
      )
      const newExpiry = new Date(Date.now() + 120_000)
      await renewLease(tx, execution.id, "worker-1", newExpiry)

      const [result] = await listExecutions(tx, workflow.id)
      expect(result.leaseExpiresAt?.getTime()).toBe(newExpiry.getTime())
    })
  })

  it("does not renew the lease for a worker that lost it to a reclaim", async () => {
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
        new Date(Date.now() - 1_000)
      )
      await startExecution(
        tx,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      // worker-1 doesn't know it lost the lease and keeps heartbeating.
      const renewed = await renewLease(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 999_000)
      )
      expect(renewed).toBeUndefined()

      const [result] = await listExecutions(tx, workflow.id)
      expect(result.leasedBy).toBe("worker-2")
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
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const completed = await completeExecution(tx, execution.id, "worker-1", {
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
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const first = await completeExecution(tx, execution.id, "worker-1", {
        status: "succeeded",
        costMicros: 1_500n,
        tokensInput: 100,
        tokensOutput: 50,
      })
      expect(first?.status).toBe("succeeded")

      const late = await completeExecution(tx, execution.id, "worker-1", {
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

  it("does not let a worker that lost the lease to a reclaim complete the execution", async () => {
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
        new Date(Date.now() - 1_000)
      )
      await startExecution(
        tx,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      // worker-1's in-flight run finishes after losing the lease to worker-2.
      const stale = await completeExecution(tx, execution.id, "worker-1", {
        status: "succeeded",
        costMicros: 1n,
        tokensInput: 1,
        tokensOutput: 1,
      })
      expect(stale).toBeUndefined()

      const [row] = await listExecutions(tx, workflow.id)
      expect(row.status).toBe("running")
      expect(row.leasedBy).toBe("worker-2")

      const real = await completeExecution(tx, execution.id, "worker-2", {
        status: "succeeded",
        costMicros: 2_000n,
        tokensInput: 200,
        tokensOutput: 100,
      })
      expect(real?.status).toBe("succeeded")
      expect(real?.costMicros).toBe(2_000n)
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
