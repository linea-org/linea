import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import { executions } from "../schema/index.js"
import {
  completeExecution,
  createExecution,
  failQueuedExecution,
  findStaleQueuedExecutions,
  getLeaseOwner,
  isLeaseValid,
  listExecutions,
  listWorkspaceExecutions,
  recordEnqueueFailure,
  renewLease,
  startExecution,
  triggerWorkflowExecution,
} from "./execution.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import {
  createWorkflow,
  createWorkflowVersion,
  publishWorkflowVersion,
  updateWorkflow,
} from "./workflow.repository.js"

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

  it("does not renew a lease that has already expired, even if nobody has reclaimed it yet", async () => {
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

      // Same worker, same identity — but its own lease already lapsed.
      const renewed = await renewLease(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )
      expect(renewed).toBeUndefined()
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

  it("does not complete an execution whose lease already expired, even if nobody has reclaimed it yet", async () => {
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

      const stale = await completeExecution(tx, execution.id, "worker-1", {
        status: "succeeded",
        costMicros: 1n,
        tokensInput: 1,
        tokensOutput: 1,
      })
      expect(stale).toBeUndefined()

      const [row] = await listExecutions(tx, workflow.id)
      expect(row.status).toBe("running")
    })
  })
})

describe("failQueuedExecution", () => {
  it("marks a never-claimed execution as failed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const failed = await failQueuedExecution(tx, execution.id, {
        message: "failed to enqueue",
      })
      expect(failed?.status).toBe("failed")
      expect(failed?.error).toEqual({ message: "failed to enqueue" })
    })
  })

  it("does not touch an execution that's already been claimed", async () => {
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

      const result = await failQueuedExecution(tx, execution.id, {
        message: "should not apply",
      })
      expect(result).toBeUndefined()

      const [row] = await listExecutions(tx, workflow.id)
      expect(row.status).toBe("running")
    })
  })
})

describe("isLeaseValid", () => {
  it("is true for the current owner while the lease is live, false once it expires", async () => {
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
      expect(await isLeaseValid(tx, execution.id, "worker-1")).toBe(true)
      expect(await isLeaseValid(tx, execution.id, "worker-2")).toBe(false)

      await renewLease(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1_000)
      )
      expect(await isLeaseValid(tx, execution.id, "worker-1")).toBe(false)
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

describe("listWorkspaceExecutions", () => {
  it("spans every workflow in the workspace, most recent first, with the owning workflow's name/slug attached", async () => {
    await withRollback(async (tx) => {
      const {
        organization,
        workflow: workflowA,
        version,
      } = await createTestFixtures(tx)
      const workflowB = await createWorkflow(tx, {
        workspaceId: organization.id,
        name: "Second Workflow",
        slug: "second-workflow",
      })
      const versionB = await createWorkflowVersion(tx, {
        workflowId: workflowB.id,
        graph: { nodes: [], edges: [] },
        contentHash: "test-hash-b",
      })

      const [fromA] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflowA.id,
          workflowVersionId: version.id,
          trigger: "manual",
          createdAt: new Date(Date.now() - 1_000),
        })
        .returning()
      const [fromB] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflowB.id,
          workflowVersionId: versionB.id,
          trigger: "manual",
          createdAt: new Date(),
        })
        .returning()

      const page = await listWorkspaceExecutions(tx, organization.id)
      expect(page.executions.map((e) => e.id)).toEqual([fromB.id, fromA.id])
      expect(page.executions[0].workflowName).toBe("Second Workflow")
      expect(page.executions[1].workflowName).toBe(workflowA.name)
      expect(page.total).toBe(2)
      expect(page.page).toBe(1)
    })
  })

  it("filters by status and by trigger", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const [queued] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          status: "queued",
        })
        .returning()
      await tx.insert(executions).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "webhook",
        status: "succeeded",
      })

      const queuedOnly = await listWorkspaceExecutions(tx, organization.id, {
        status: "queued",
      })
      expect(queuedOnly.executions.map((e) => e.id)).toEqual([queued.id])
      expect(queuedOnly.total).toBe(1)

      const manualOnly = await listWorkspaceExecutions(tx, organization.id, {
        trigger: "manual",
      })
      expect(manualOnly.executions.map((e) => e.id)).toEqual([queued.id])
      expect(manualOnly.total).toBe(1)
    })
  })

  it("does not include executions from another workspace", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)
      await tx.insert(executions).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const page = await listWorkspaceExecutions(tx, otherOrg.id)
      expect(page.executions).toEqual([])
      expect(page.total).toBe(0)
    })
  })

  it("paginates: total reflects every matching row, but executions only holds the requested page", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const rows = Array.from({ length: 5 }, (_, i) => ({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual" as const,
        createdAt: new Date(Date.now() - i * 1_000),
      }))
      await tx.insert(executions).values(rows)

      const firstPage = await listWorkspaceExecutions(tx, organization.id, {
        pageSize: 2,
      })
      expect(firstPage.executions).toHaveLength(2)
      expect(firstPage.total).toBe(5)
      expect(firstPage.page).toBe(1)
      expect(firstPage.pageSize).toBe(2)

      const secondPage = await listWorkspaceExecutions(tx, organization.id, {
        pageSize: 2,
        page: 2,
      })
      expect(secondPage.executions).toHaveLength(2)
      expect(secondPage.total).toBe(5)
      expect(
        secondPage.executions.every(
          (e) => !firstPage.executions.some((f) => f.id === e.id)
        )
      ).toBe(true)

      const thirdPage = await listWorkspaceExecutions(tx, organization.id, {
        pageSize: 2,
        page: 3,
      })
      expect(thirdPage.executions).toHaveLength(1)
      expect(thirdPage.total).toBe(5)
    })
  })

  it("orders ties on createdAt deterministically, so paging never skips or repeats a row", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      // Every row shares one createdAt — createdAt alone can't order them,
      // so this only stays stable across the two queries below if there's
      // a unique tie-breaker.
      const sameInstant = new Date()
      const rows = Array.from({ length: 6 }, () => ({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual" as const,
        createdAt: sameInstant,
      }))
      await tx.insert(executions).values(rows)

      const firstPage = await listWorkspaceExecutions(tx, organization.id, {
        pageSize: 4,
        page: 1,
      })
      const secondPage = await listWorkspaceExecutions(tx, organization.id, {
        pageSize: 4,
        page: 2,
      })

      const firstIds = firstPage.executions.map((e) => e.id)
      const secondIds = secondPage.executions.map((e) => e.id)
      const combined = [...firstIds, ...secondIds]

      expect(new Set(combined).size).toBe(combined.length)
      expect(combined).toHaveLength(6)
    })
  })

  it("holds page boundaries fixed against a concurrent insert when callers pass a shared asOf", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const rows = Array.from({ length: 5 }, (_, i) => ({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual" as const,
        createdAt: new Date(Date.now() - i * 1_000),
      }))
      await tx.insert(executions).values(rows)

      const asOf = new Date()
      const firstPage = await listWorkspaceExecutions(tx, organization.id, {
        pageSize: 2,
        page: 1,
        asOf,
      })

      // A new execution lands between the two page fetches — without asOf this
      // shifts every offset and either skips or repeats a row on page 2.
      await tx.insert(executions).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        createdAt: new Date(),
      })

      const secondPage = await listWorkspaceExecutions(tx, organization.id, {
        pageSize: 2,
        page: 2,
        asOf,
      })

      expect(secondPage.total).toBe(5)
      expect(
        secondPage.executions.every(
          (e) => !firstPage.executions.some((f) => f.id === e.id)
        )
      ).toBe(true)
    })
  })

  it("excludes rows created after asOf", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const [before] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          createdAt: new Date(Date.now() - 1_000),
        })
        .returning()
      const asOf = new Date()
      await tx.insert(executions).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        createdAt: new Date(asOf.getTime() + 1_000),
      })

      const page = await listWorkspaceExecutions(tx, organization.id, { asOf })
      expect(page.executions.map((e) => e.id)).toEqual([before.id])
      expect(page.total).toBe(1)
    })
  })
})

describe("triggerWorkflowExecution", () => {
  it("creates an execution for a published, non-archived workflow, by id or by slug", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)

      const byId = await triggerWorkflowExecution(
        tx,
        organization.id,
        { by: "id", value: workflow.id },
        { trigger: "manual" }
      )
      expect(byId.outcome).toBe("created")

      const bySlug = await triggerWorkflowExecution(
        tx,
        organization.id,
        { by: "slug", value: workflow.slug },
        { trigger: "webhook", triggerPayload: { source: "test" } }
      )
      expect(bySlug.outcome).toBe("created")
      if (bySlug.outcome === "created") {
        expect(bySlug.execution.trigger).toBe("webhook")
        expect(bySlug.execution.triggerPayload).toEqual({ source: "test" })
      }
    })
  })

  it("returns not_found for a workflow that doesn't exist or belongs to another workspace", async () => {
    await withRollback(async (tx) => {
      const { workflow: otherWorkflow } = await createTestFixtures(tx)
      const { organization } = await createTestFixtures(tx)

      const result = await triggerWorkflowExecution(
        tx,
        organization.id,
        { by: "id", value: otherWorkflow.id },
        { trigger: "manual" }
      )
      expect(result.outcome).toBe("not_found")
    })
  })

  it("returns unpublished for a workflow with no published version", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)

      const result = await triggerWorkflowExecution(
        tx,
        organization.id,
        { by: "id", value: workflow.id },
        { trigger: "manual" }
      )
      expect(result.outcome).toBe("unpublished")
    })
  })

  it("returns archived for an archived workflow, even with a published version", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
      await updateWorkflow(tx, organization.id, workflow.id, {
        archivedAt: new Date(),
      })

      const result = await triggerWorkflowExecution(
        tx,
        organization.id,
        { by: "id", value: workflow.id },
        { trigger: "manual" }
      )
      expect(result.outcome).toBe("archived")
    })
  })

  it("blocks a concurrent archive from committing until the trigger's row lock is released", async () => {
    // Same technique as createWorkflowVersion's lock test: two real
    // connections, since Promise.all doesn't reliably force real overlap.
    const { organization, workflow, version } = await db.transaction((tx) =>
      createTestFixtures(tx)
    )
    await publishWorkflowVersion(db, workflow.id, version.id)

    const clientA = await pool.connect()
    const clientB = await pool.connect()

    try {
      await clientA.query("BEGIN")
      await clientA.query("SELECT id FROM workflows WHERE id = $1 FOR UPDATE", [
        workflow.id,
      ])

      await clientB.query("BEGIN")
      let archiveCommitted = false
      const archiveAttempt = clientB
        .query("UPDATE workflows SET archived_at = now() WHERE id = $1", [
          workflow.id,
        ])
        .then(() => {
          archiveCommitted = true
        })

      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(archiveCommitted).toBe(false)

      await clientA.query("COMMIT")
      await archiveAttempt
      expect(archiveCommitted).toBe(true)

      await clientB.query("COMMIT")
    } finally {
      await clientA.query("ROLLBACK").catch(() => {})
      await clientB.query("ROLLBACK").catch(() => {})
      clientA.release()
      clientB.release()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})

describe("findStaleQueuedExecutions", () => {
  it("returns only queued executions older than the cutoff", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const cutoff = new Date()

      const [stale] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          createdAt: new Date(cutoff.getTime() - 1_000),
        })
        .returning()
      await tx.insert(executions).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        createdAt: new Date(cutoff.getTime() + 1_000),
      })
      const [running] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          createdAt: new Date(cutoff.getTime() - 1_000),
        })
        .returning()
      await startExecution(
        tx,
        running.id,
        "worker-a",
        new Date(Date.now() + 60_000)
      )

      const results = await findStaleQueuedExecutions(tx, cutoff)
      expect(results.map((e) => e.id)).toEqual([stale.id])
    })
  })
})

describe("recordEnqueueFailure", () => {
  it("increments enqueueAttempts and leaves the execution queued", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "schedule",
      })

      const result = await recordEnqueueFailure(tx, execution.id)
      expect(result?.status).toBe("queued")
      expect(result?.enqueueAttempts).toBe(1)
    })
  })

  it("never fails the execution, no matter how many attempts accumulate", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "schedule",
      })

      let last
      for (let attempt = 1; attempt <= 20; attempt++) {
        last = await recordEnqueueFailure(tx, execution.id)
      }

      expect(last?.status).toBe("queued")
      expect(last?.enqueueAttempts).toBe(20)
    })
  })

  it("returns undefined for an execution that's no longer queued", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "schedule",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const result = await recordEnqueueFailure(tx, execution.id)
      expect(result).toBeUndefined()
    })
  })
})
