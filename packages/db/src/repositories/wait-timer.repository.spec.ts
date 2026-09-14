import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  claimAndResolveDueWaitTimer,
  claimPauseForPendingWait,
  createWaitTimer,
  getWaitTimer,
} from "./wait-timer.repository.js"
import { db, pool } from "../clients/index.js"
import { createExecution, startExecution } from "./execution.repository.js"
import { executions } from "../schema/index.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function insertExecution(tx: Transaction) {
  const { organization, workflow, version } = await createTestFixtures(tx)
  const execution = await createExecution(tx, {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
  })
  return { organization, workflow, version, execution }
}

describe("wait-timer.repository", () => {
  it("creates a wait timer, is idempotent on (executionId, nodeId), and is retrievable via getWaitTimer", async () => {
    await withRollback(async (tx) => {
      const { organization, execution } = await insertExecution(tx)
      const resumeAt = new Date(Date.now() + 60_000)

      const created = await createWaitTimer(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
        resumeAt,
      })
      expect(created?.fired).toBe(false)

      // A retry (e.g. after a crash before checkpointing) must not create a second row.
      const duplicate = await createWaitTimer(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
        resumeAt: new Date(Date.now() + 120_000),
      })
      expect(duplicate).toBeUndefined()

      const fetched = await getWaitTimer(
        tx,
        organization.id,
        execution.id,
        "wait-1"
      )
      expect(fetched?.resumeAt.getTime()).toBe(resumeAt.getTime())
    })
  })

  describe("claimAndResolveDueWaitTimer", () => {
    it("fires a past-due timer and resumes the paused execution", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await tx
          .update(executions)
          .set({ status: "paused", leasedBy: null, leaseExpiresAt: null })
          .where(eq(executions.id, execution.id))
        await createWaitTimer(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "wait-1",
          resumeAt: new Date(Date.now() - 60_000),
        })

        const result = await claimAndResolveDueWaitTimer(tx)
        expect(result.outcome).toBe("fired")
        if (result.outcome === "fired") {
          expect(result.waitTimer.fired).toBe(true)
          expect(result.waitTimer.firedAt).not.toBeNull()
        }

        const [reloaded] = await tx
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))
        expect(reloaded.status).toBe("queued")
      })
    })

    it("does not claim a timer with a future resumeAt", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await createWaitTimer(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "future",
          resumeAt: new Date(Date.now() + 60_000),
        })

        const result = await claimAndResolveDueWaitTimer(tx)
        expect(result.outcome).toBe("empty")
      })
    })

    it("does not re-claim an already-fired timer", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await createWaitTimer(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "wait-1",
          resumeAt: new Date(Date.now() - 60_000),
        })

        const first = await claimAndResolveDueWaitTimer(tx)
        expect(first.outcome).toBe("fired")

        const second = await claimAndResolveDueWaitTimer(tx)
        expect(second.outcome).toBe("empty")
      })
    })
  })

  describe("claimPauseForPendingWait", () => {
    it("pauses the execution when the timer has not fired", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await startExecution(
          tx,
          execution.id,
          "worker-a",
          new Date(Date.now() + 60_000)
        )
        await createWaitTimer(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "wait-1",
          resumeAt: new Date(Date.now() + 60_000),
        })

        const claim = await claimPauseForPendingWait(
          tx,
          organization.id,
          execution.id,
          "wait-1",
          "worker-a"
        )
        expect(claim.outcome).toBe("paused")

        const [reloaded] = await tx
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))
        expect(reloaded.status).toBe("paused")
      })
    })

    it("reports lease-lost instead of paused when the caller's lease no longer holds", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await startExecution(
          tx,
          execution.id,
          "worker-a",
          new Date(Date.now() - 1_000) // already expired
        )
        await createWaitTimer(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "wait-1",
          resumeAt: new Date(Date.now() + 60_000),
        })

        const claim = await claimPauseForPendingWait(
          tx,
          organization.id,
          execution.id,
          "wait-1",
          "worker-a"
        )
        expect(claim.outcome).toBe("lease-lost")

        // Must not be falsely reported as paused while actually left "running" with a dead lease.
        const [reloaded] = await tx
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))
        expect(reloaded.status).toBe("running")
      })
    })

    it("does not pause when the timer already fired", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await startExecution(
          tx,
          execution.id,
          "worker-a",
          new Date(Date.now() + 60_000)
        )
        await createWaitTimer(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "wait-1",
          resumeAt: new Date(Date.now() - 60_000),
        })
        // Fires it directly, bypassing a real pause — claimAndResolveDueWaitTimer's own
        // executions update is conditioned on status='paused', which this execution (still
        // "running" from startExecution above) never reached, so it's a no-op here.
        await claimAndResolveDueWaitTimer(tx)

        const claim = await claimPauseForPendingWait(
          tx,
          organization.id,
          execution.id,
          "wait-1",
          "worker-a"
        )
        expect(claim.outcome).toBe("already-resolved")

        const [reloaded] = await tx
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))
        expect(reloaded.status).toBe("running")
      })
    })

    it("retries a due timer skipped before its pause claim completes", async () => {
      const fixtures = await db.transaction(insertExecution)
      const { organization, execution } = fixtures
      const lockClient = await pool.connect()
      try {
        await startExecution(
          db,
          execution.id,
          "worker-a",
          new Date(Date.now() + 60_000)
        )
        await createWaitTimer(db, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "wait-1",
          // Epoch isolates this timer from due timers created by parallel tests.
          resumeAt: new Date(0),
        })
        await lockClient.query("BEGIN")
        await lockClient.query(
          "SELECT id FROM wait_timers WHERE execution_id = $1 AND node_id = $2 FOR UPDATE",
          [execution.id, "wait-1"]
        )
        const claimPromise = claimPauseForPendingWait(
          db,
          organization.id,
          execution.id,
          "wait-1",
          "worker-a"
        )
        const fireResult = await claimAndResolveDueWaitTimer(db, new Date(1))
        await lockClient.query("COMMIT")
        const claimResult = await claimPromise
        expect(fireResult.outcome).toBe("empty")
        expect(claimResult.outcome).toBe("paused")
        const retryResult = await claimAndResolveDueWaitTimer(db, new Date(1))
        expect(retryResult.outcome).toBe("fired")
        const [resumedExecution] = await db
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))
        expect(resumedExecution.status).toBe("queued")
      } finally {
        await lockClient.query("ROLLBACK")
        lockClient.release()
        await pool.query("DELETE FROM organizations WHERE id = $1", [
          organization.id,
        ])
      }
    })
  })
})
