import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { WaitNode } from "./wait.node"

afterAll(async () => {
  await pool.end()
})

async function setup() {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Wait Node Test Org",
      slug: `wait-node-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Wait Node Test Workflow",
    slug: `wait-node-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "wait-node-hash",
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
  })
  return { organization, execution }
}

describe("WaitNode", () => {
  it("creates a wait timer and pauses on first visit, then pauses again while not yet fired", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new WaitNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
      }

      await expect(
        node.execute(
          { mode: "duration", amount: 5, unit: "minutes" },
          undefined,
          context
        )
      ).rejects.toThrow("Execution paused at node wait-1")

      const timer = await repositories.waitTimer.getWaitTimer(
        db,
        organization.id,
        execution.id,
        "wait-1"
      )
      expect(timer).toMatchObject({ fired: false })

      // Second visit (a resumed run re-entering the same node) — still not fired, pauses again without creating a duplicate row.
      await expect(
        node.execute(
          { mode: "duration", amount: 5, unit: "minutes" },
          undefined,
          context
        )
      ).rejects.toThrow("Execution paused at node wait-1")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("resolves to the resumedAt output once the timer has fired", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new WaitNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
      }

      await expect(
        node.execute(
          { mode: "duration", amount: 1, unit: "seconds" },
          undefined,
          context
        )
      ).rejects.toThrow()

      // claimAndResolveDueWaitTimer claims one arbitrary due row database-wide (it backs the
      // background poller's "fire the next one" step, not scoped to a workspace) — so a real
      // leftover due timer anywhere in this shared local dev Postgres could get claimed instead
      // of this test's own timer. Draining fully (not trusting a single claim's own return value)
      // guarantees this test's timer is fired regardless of what else is due, then reading it back
      // directly gets the specific row this assertion actually needs.
      const futureNow = new Date(Date.now() + 60_000) // force it due, regardless of the real 1-second wait
      let drainResult =
        await repositories.waitTimer.claimAndResolveDueWaitTimer(db, futureNow)
      while (drainResult.outcome === "fired") {
        drainResult = await repositories.waitTimer.claimAndResolveDueWaitTimer(
          db,
          futureNow
        )
      }

      const firedTimer = await repositories.waitTimer.getWaitTimer(
        db,
        organization.id,
        execution.id,
        "wait-1"
      )
      expect(firedTimer?.fired).toBe(true)

      const output = await node.execute(
        { mode: "duration", amount: 1, unit: "seconds" },
        undefined,
        context
      )
      expect(output).toEqual({
        resumedAt: firedTimer!.firedAt!.toISOString(),
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("computes resumeAt from an explicit until timestamp", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new WaitNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
      }
      const until = "2099-01-01T00:00:00.000Z"

      await expect(
        node.execute({ mode: "until", until }, undefined, context)
      ).rejects.toThrow("Execution paused at node wait-1")

      const timer = await repositories.waitTimer.getWaitTimer(
        db,
        organization.id,
        execution.id,
        "wait-1"
      )
      expect(timer?.resumeAt.toISOString()).toBe(until)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("throws a plain error for a missing amount, not a pause", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new WaitNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
      }

      await expect(
        node.execute({ mode: "duration" }, undefined, context)
      ).rejects.toThrow('requires a positive "amount"')
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("throws a plain error for an unparseable until timestamp", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new WaitNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
      }

      await expect(
        node.execute({ mode: "until", until: "not-a-date" }, undefined, context)
      ).rejects.toThrow("could not parse")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
