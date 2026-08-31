import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  completeEvalRun,
  createEvalRun,
  getEvalRunById,
  insertEvalResults,
  listEvalResults,
  listEvalRuns,
} from "./eval-run.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import { publishWorkflowVersion } from "./workflow.repository.js"

describe("createEvalRun / completeEvalRun", () => {
  it("starts at zero counts and records final counts + cost on completion", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)

      const run = await createEvalRun(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      expect(run.total).toBe(0)
      expect(run.completedAt).toBeNull()

      const completed = await completeEvalRun(tx, organization.id, run.id, {
        passed: 3,
        failed: 1,
        total: 4,
        costMicros: 500n,
      })
      expect(completed?.passed).toBe(3)
      expect(completed?.failed).toBe(1)
      expect(completed?.total).toBe(4)
      expect(completed?.costMicros).toBe(500n)
      expect(completed?.completedAt).toBeInstanceOf(Date)

      // Not completable from another workspace, even with the right runId.
      const { organization: otherOrg } = await createTestFixtures(tx)
      const fromOtherWorkspace = await completeEvalRun(
        tx,
        otherOrg.id,
        run.id,
        {
          passed: 0,
          failed: 0,
          total: 0,
          costMicros: 0n,
        }
      )
      expect(fromOtherWorkspace).toBeUndefined()
    })
  })
})

describe("insertEvalResults / listEvalResults", () => {
  it("stamps workspaceId and runId on every result", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
      const run = await createEvalRun(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "publish",
      })

      await insertEvalResults(tx, run.id, organization.id, [
        {
          caseId: randomUUID(),
          status: "passed",
          score: 1,
          output: { text: "ok" },
          costMicros: 10n,
        },
        {
          caseId: randomUUID(),
          status: "failed",
          score: 0,
          output: { text: "not ok" },
          costMicros: 5n,
        },
      ])

      const results = await listEvalResults(tx, organization.id, run.id)
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.runId === run.id)).toBe(true)
      expect(results.every((r) => r.workspaceId === organization.id)).toBe(true)
      expect(results.map((r) => r.status).sort()).toEqual(["failed", "passed"])

      // Not visible from another workspace, even with the right runId.
      const { organization: otherOrg } = await createTestFixtures(tx)
      expect(await listEvalResults(tx, otherOrg.id, run.id)).toEqual([])
    })
  })

  it("is a no-op for an empty results array", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
      const run = await createEvalRun(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await expect(
        insertEvalResults(tx, run.id, organization.id, [])
      ).resolves.toBeUndefined()
      expect(await listEvalResults(tx, organization.id, run.id)).toHaveLength(0)
    })
  })
})

describe("getEvalRunById", () => {
  it("finds a run scoped to its own workspace, not another one", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
      const { organization: otherOrg } = await createTestFixtures(tx)

      const run = await createEvalRun(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const found = await getEvalRunById(tx, organization.id, run.id)
      expect(found?.id).toBe(run.id)

      const notFound = await getEvalRunById(tx, otherOrg.id, run.id)
      expect(notFound).toBeUndefined()
    })
  })

  it("returns undefined for a nonexistent id", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const found = await getEvalRunById(tx, organization.id, randomUUID())
      expect(found).toBeUndefined()
    })
  })
})

describe("listEvalRuns", () => {
  // Postgres' now() is stable for the whole transaction, and every test here runs inside one —
  // so startedAt reliably ties between rows created in the same test. Asserting scoping (right
  // workflow's runs, wrong workflow's excluded) is meaningful here; asserting a specific
  // newest-first order between same-transaction rows would not be.
  it("is scoped to workspace and workflow", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
      const { workflow: otherWorkflow, version: otherVersion } =
        await createTestFixtures(tx)
      await publishWorkflowVersion(tx, otherWorkflow.id, otherVersion.id)

      const first = await createEvalRun(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const second = await createEvalRun(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "publish",
      })
      await createEvalRun(tx, {
        workspaceId: otherWorkflow.workspaceId,
        workflowId: otherWorkflow.id,
        workflowVersionId: otherVersion.id,
        trigger: "manual",
      })

      const runs = await listEvalRuns(tx, organization.id, workflow.id)
      expect(runs.map((r) => r.id).sort()).toEqual([first.id, second.id].sort())
    })
  })
})
