import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  environments,
  environmentWorkflowBindings,
  executions,
  externalSubjects,
  organizations,
  workflows,
} from "../schema/index.js"
import {
  claimAndDecideTimedOutApprovalRequest,
  createApprovalRequest,
} from "./approval-request.repository.js"
import {
  getExecutionById,
  startExecution,
  triggerWorkflowExecution,
} from "./execution.repository.js"
import {
  createExecution,
  createTestFixtures,
  publishTestWorkflow,
  withRollback,
} from "./test-utils.js"
import type { DbClient, Transaction } from "./types.js"

async function queuedExecution(tx: Transaction) {
  const fixtures = await createTestFixtures(tx)
  const execution = await createExecution(tx, {
    workspaceId: fixtures.organization.id,
    workflowId: fixtures.workflow.id,
    workflowVersionId: fixtures.version.id,
    trigger: "manual",
  })
  if (!execution.environmentId) throw new Error("Execution has no Environment")
  return { ...fixtures, execution, environmentId: execution.environmentId }
}

async function expectRevokedAtClaim(
  client: DbClient,
  executionId: string,
  reason: string
) {
  expect(
    await startExecution(
      client,
      executionId,
      "worker-1",
      new Date(Date.now() + 60_000)
    )
  ).toBeUndefined()
  expect(await getExecutionById(client, executionId)).toMatchObject({
    status: "failed",
    leasedBy: null,
    leaseExpiresAt: null,
    error: {
      message: `Execution authority revoked: ${reason}`,
      code: "authority_revoked",
    },
  })
}

describe("startExecution authority", () => {
  it("fails a queued Execution whose Environment was disabled before the claim", async () => {
    await withRollback(async (tx) => {
      const { execution, environmentId } = await queuedExecution(tx)
      await tx
        .update(environments)
        .set({ enabled: false })
        .where(eq(environments.id, environmentId))
      await expectRevokedAtClaim(tx, execution.id, "Environment disabled")
    })
  })
  it("fails a reclaim of an expired lease once the Environment is disabled", async () => {
    await withRollback(async (tx) => {
      const { execution, environmentId } = await queuedExecution(tx)
      await startExecution(
        tx,
        execution.id,
        "worker-0",
        new Date(Date.now() - 1_000)
      )
      await tx
        .update(environments)
        .set({ enabled: false })
        .where(eq(environments.id, environmentId))
      await expectRevokedAtClaim(tx, execution.id, "Environment disabled")
    })
  })
  it("fails a queued Execution whose External Subject was disabled before the claim", async () => {
    await withRollback(async (tx) => {
      const { organization, execution } = await queuedExecution(tx)
      const [subject] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: organization.id,
          issuer: "https://identity.example.com",
          issuerSubject: `subject-${randomUUID()}`,
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      await tx
        .update(executions)
        .set({ externalSubjectRecordId: subject.id })
        .where(eq(executions.id, execution.id))
      await tx
        .update(externalSubjects)
        .set({ status: "disabled", disabledAt: new Date() })
        .where(eq(externalSubjects.id, subject.id))
      await expectRevokedAtClaim(
        tx,
        execution.id,
        "External Subject disabled or erased"
      )
    })
  })
  it("fails a queued Execution whose Workflow was archived before the claim", async () => {
    await withRollback(async (tx) => {
      const { workflow, execution } = await queuedExecution(tx)
      await tx
        .update(workflows)
        .set({ archivedAt: new Date() })
        .where(eq(workflows.id, workflow.id))
      await expectRevokedAtClaim(tx, execution.id, "Workflow archived")
    })
  })
  it("fails a deployed Execution whose binding was disabled, but still claims a Development test run that never had one", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version, execution } =
        await queuedExecution(tx)
      await publishTestWorkflow(tx, workflow.id, version.id)
      const deployed = await triggerWorkflowExecution(
        tx,
        organization.id,
        { by: "id", value: workflow.id },
        { trigger: "manual" }
      )
      if (deployed.outcome !== "created") throw new Error(deployed.outcome)
      await tx
        .update(environmentWorkflowBindings)
        .set({ enabled: false })
        .where(eq(environmentWorkflowBindings.workflowId, workflow.id))
      await expectRevokedAtClaim(
        tx,
        deployed.execution.id,
        "Workflow deployment disabled"
      )
      expect(
        (
          await startExecution(
            tx,
            execution.id,
            "worker-1",
            new Date(Date.now() + 60_000)
          )
        )?.status
      ).toBe("running")
    })
  })
  it("does not continue a paused Execution auto-approved after its Environment was disabled", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, execution, environmentId } =
        await queuedExecution(tx)
      await createApprovalRequest(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "approval-1",
        audience: "workspace",
        display: { title: "Send?" },
        requestedAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-01T00:01:00.000Z"),
        timeoutAction: "auto_approve",
      })
      await tx
        .update(executions)
        .set({ status: "paused" })
        .where(eq(executions.id, execution.id))
      await tx
        .update(environments)
        .set({ enabled: false })
        .where(eq(environments.id, environmentId))
      const decided = await claimAndDecideTimedOutApprovalRequest(
        tx,
        new Date("2026-01-01T00:02:00.000Z"),
        organization.id
      )
      expect(decided.outcome).toBe("decided")
      expect((await getExecutionById(tx, execution.id))?.status).toBe("queued")
      await expectRevokedAtClaim(tx, execution.id, "Environment disabled")
    })
  })
  it("waits for a concurrent Environment disable and then refuses the claim", async () => {
    const { organization, execution, environmentId } = await db.transaction(
      (tx) => queuedExecution(tx)
    )
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        "UPDATE environments SET enabled = false WHERE id = $1",
        [environmentId]
      )
      let settled = false
      const claim = startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      ).finally(() => {
        settled = true
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(settled).toBe(false)
      await client.query("COMMIT")
      expect(await claim).toBeUndefined()
      expect((await getExecutionById(db, execution.id))?.error?.code).toBe(
        "authority_revoked"
      )
    } finally {
      await client.query("ROLLBACK").catch(() => {})
      client.release()
      await db
        .delete(organizations)
        .where(eq(organizations.id, organization.id))
    }
  })
})
