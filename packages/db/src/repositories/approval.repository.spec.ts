import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  claimAndResolveTimedOutApproval,
  claimPauseForPendingApproval,
  createApproval,
  getApproval,
  listPendingApprovals,
  resolveApproval,
} from "./approval.repository.js"
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

describe("approval.repository", () => {
  it("creates an approval, is idempotent on (executionId, nodeId), and is retrievable via getApproval", async () => {
    await withRollback(async (tx) => {
      const { organization, execution } = await insertExecution(tx)

      const created = await createApproval(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
        message: "Ship it?",
      })
      expect(created?.status).toBe("pending")

      // A retry (e.g. after a crash before checkpointing) must not create a second row.
      const duplicate = await createApproval(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
        message: "different message",
      })
      expect(duplicate).toBeUndefined()

      const fetched = await getApproval(
        tx,
        organization.id,
        execution.id,
        "approval-1"
      )
      expect(fetched?.message).toBe("Ship it?")
    })
  })

  describe("listPendingApprovals", () => {
    it("includes approvals with no approverEmails restriction for any user", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })

        const pending = await listPendingApprovals(
          tx,
          organization.id,
          "anyone@test.dev"
        )
        expect(pending).toHaveLength(1)
      })
    })

    it("scopes to listed approverEmails when set", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
          approverEmails: ["reviewer@test.dev"],
        })

        expect(
          await listPendingApprovals(tx, organization.id, "reviewer@test.dev")
        ).toHaveLength(1)
        expect(
          await listPendingApprovals(
            tx,
            organization.id,
            "someone-else@test.dev"
          )
        ).toHaveLength(0)
      })
    })

    it("excludes already-resolved approvals", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        const approval = await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })
        await resolveApproval(tx, organization.id, approval!.id, {
          status: "approved",
          respondedBy: null,
          respondedByEmail: "anyone@test.dev",
        })

        expect(
          await listPendingApprovals(tx, organization.id, "anyone@test.dev")
        ).toHaveLength(0)
      })
    })

    it("matches a designated approver regardless of casing on either side", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
          approverEmails: ["Reviewer@Test.dev"],
        })

        expect(
          await listPendingApprovals(tx, organization.id, "reviewer@test.dev")
        ).toHaveLength(1)
      })
    })
  })

  describe("resolveApproval", () => {
    it("resolves a pending approval and flips its paused execution back to queued", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await tx
          .update(executions)
          .set({ status: "paused", leasedBy: null, leaseExpiresAt: null })
          .where(eq(executions.id, execution.id))

        const approval = await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })

        const resolved = await resolveApproval(
          tx,
          organization.id,
          approval!.id,
          {
            status: "approved",
            respondedBy: null,
            respondedByEmail: "anyone@test.dev",
            comment: "looks good",
          }
        )
        expect(resolved).toMatchObject({
          status: "approved",
          comment: "looks good",
        })

        const [reloaded] = await tx
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))
        expect(reloaded.status).toBe("queued")
      })
    })

    it("returns undefined and does not double-resolve an already-responded approval", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        const approval = await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })
        await resolveApproval(tx, organization.id, approval!.id, {
          status: "approved",
          respondedBy: null,
          respondedByEmail: "anyone@test.dev",
        })

        const second = await resolveApproval(
          tx,
          organization.id,
          approval!.id,
          {
            status: "rejected",
            respondedBy: null,
            respondedByEmail: "anyone@test.dev",
          }
        )
        expect(second).toBeUndefined()
      })
    })

    it("returns undefined when the responder's email is not among the designated approverEmails", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        const approval = await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
          approverEmails: ["designated@test.dev"],
        })

        const rejected = await resolveApproval(
          tx,
          organization.id,
          approval!.id,
          {
            status: "approved",
            respondedBy: null,
            respondedByEmail: "not-designated@test.dev",
          }
        )
        expect(rejected).toBeUndefined()

        // Still pending — a non-designated response must not have consumed it.
        expect(
          await listPendingApprovals(tx, organization.id, "designated@test.dev")
        ).toHaveLength(1)

        const resolved = await resolveApproval(
          tx,
          organization.id,
          approval!.id,
          {
            status: "approved",
            respondedBy: null,
            respondedByEmail: "designated@test.dev",
          }
        )
        expect(resolved?.status).toBe("approved")
      })
    })

    it("resolves for a designated approver even when the responder's stored email differs in casing", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        const approval = await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
          approverEmails: ["designated@test.dev"],
        })

        const resolved = await resolveApproval(
          tx,
          organization.id,
          approval!.id,
          {
            status: "approved",
            respondedBy: null,
            respondedByEmail: "Designated@Test.dev",
          }
        )
        expect(resolved?.status).toBe("approved")
      })
    })
  })

  describe("claimAndResolveTimedOutApproval", () => {
    it("resolves a past-due approval per its timeoutAction and resumes the paused execution", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await tx
          .update(executions)
          .set({ status: "paused", leasedBy: null, leaseExpiresAt: null })
          .where(eq(executions.id, execution.id))
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
          timeoutAt: new Date(Date.now() - 60_000),
          timeoutAction: "auto_reject",
        })

        const result = await claimAndResolveTimedOutApproval(tx)
        expect(result.outcome).toBe("resolved")
        if (result.outcome === "resolved") {
          expect(result.approval).toMatchObject({
            status: "rejected",
            timedOut: true,
          })
        }

        const [reloaded] = await tx
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))
        expect(reloaded.status).toBe("queued")
      })
    })

    it("applies auto_approve", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
          timeoutAt: new Date(Date.now() - 60_000),
          timeoutAction: "auto_approve",
        })

        const result = await claimAndResolveTimedOutApproval(tx)
        expect(result.outcome).toBe("resolved")
        if (result.outcome === "resolved") {
          expect(result.approval).toMatchObject({
            status: "approved",
            timedOut: true,
          })
        }
      })
    })

    it("does not claim approvals with no timeout or a future timeout", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "no-timeout",
        })
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "future-timeout",
          timeoutAt: new Date(Date.now() + 60_000),
          timeoutAction: "auto_reject",
        })

        const result = await claimAndResolveTimedOutApproval(tx)
        expect(result.outcome).toBe("empty")
      })
    })
  })

  describe("claimPauseForPendingApproval", () => {
    it("pauses the execution when the approval is still pending", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await startExecution(
          tx,
          execution.id,
          "worker-a",
          new Date(Date.now() + 60_000)
        )
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })

        const claim = await claimPauseForPendingApproval(
          tx,
          organization.id,
          execution.id,
          "approval-1",
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
        await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })

        const claim = await claimPauseForPendingApproval(
          tx,
          organization.id,
          execution.id,
          "approval-1",
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

    it("does not pause when the approval was already resolved", async () => {
      await withRollback(async (tx) => {
        const { organization, execution } = await insertExecution(tx)
        await startExecution(
          tx,
          execution.id,
          "worker-a",
          new Date(Date.now() + 60_000)
        )
        const approval = await createApproval(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })
        await resolveApproval(tx, organization.id, approval!.id, {
          status: "approved",
          respondedBy: null,
          respondedByEmail: "anyone@test.dev",
        })

        const claim = await claimPauseForPendingApproval(
          tx,
          organization.id,
          execution.id,
          "approval-1",
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

    // Real concurrent connections (not withRollback's shared tx), same pattern as schedule.repository.spec.ts's concurrency test.
    it("never leaves the execution paused with an already-resolved approval, whichever caller wins the race", async () => {
      const { organization, execution } = await db.transaction((tx) =>
        insertExecution(tx)
      )
      try {
        await startExecution(
          db,
          execution.id,
          "worker-a",
          new Date(Date.now() + 60_000)
        )
        const approval = await createApproval(db, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "approval-1",
        })

        const [claimResult, resolveResult] = await Promise.all([
          claimPauseForPendingApproval(
            db,
            organization.id,
            execution.id,
            "approval-1",
            "worker-a"
          ),
          resolveApproval(db, organization.id, approval!.id, {
            status: "approved",
            respondedBy: null,
            respondedByEmail: "anyone@test.dev",
          }),
        ])

        const [finalExecution] = await db
          .select()
          .from(executions)
          .where(eq(executions.id, execution.id))

        // The invariant this fix protects: never end up paused with a resolved approval and nothing left to resume it.
        expect(
          finalExecution.status === "paused" && resolveResult !== undefined
        ).toBe(false)

        if (claimResult.outcome === "paused") {
          // resolveApproval only ran after the pause committed, so its paused->queued flip matched and succeeded.
          expect(resolveResult).toBeDefined()
          expect(finalExecution.status).toBe("queued")
        } else {
          // resolveApproval won first; claimPauseForPendingApproval saw it was no longer pending and did not pause on top of it.
          expect(resolveResult).toBeDefined()
          expect(finalExecution.status).toBe("running")
        }
      } finally {
        await pool.query("DELETE FROM organizations WHERE id = $1", [
          organization.id,
        ])
      }
    })
  })
})
