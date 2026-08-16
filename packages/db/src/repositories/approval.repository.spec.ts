import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  claimAndResolveTimedOutApproval,
  createApproval,
  getApproval,
  listPendingApprovals,
  resolveApproval,
} from "./approval.repository.js"
import { createExecution } from "./execution.repository.js"
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
})
