import { describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createExecution } from "./execution.repository.js"
import { createFlagIfNew } from "./flag.repository.js"
import {
  deriveSignalStatus,
  getSignalDetail,
  getSignalsTrend,
  listSignals,
  resolveSignal,
} from "./signal.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import { createWorkflow, createWorkflowVersion } from "./workflow.repository.js"

describe("recordSignalOccurrence (via createFlagIfNew)", () => {
  it("groups two flags of the same pattern across different executions into one signal, with a growing occurrence count", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const executionA = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const executionB = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: executionA.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${executionA.id}:n1`,
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: executionB.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${executionB.id}:n1`,
      })

      const signals = await listSignals(tx, organization.id)
      expect(signals).toHaveLength(1)
      expect(signals[0]).toMatchObject({
        flagType: "retry_storm",
        workflowId: workflow.id,
        nodeId: "n1",
        status: "open",
        occurrenceCount: 2,
      })
    })
  })

  it("keeps a different flag type on the same node as a separate signal", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${execution.id}:n1`,
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "n1",
        flagType: "cost_jump",
        dedupeKey: `cost_jump:${execution.id}:n1`,
      })

      const signals = await listSignals(tx, organization.id)
      expect(signals).toHaveLength(2)
    })
  })

  it("reopens a resolved signal as regressed when a new occurrence lands", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const executionA = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const executionB = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: executionA.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${executionA.id}:n1`,
      })

      const [openSignal] = await listSignals(tx, organization.id)
      const resolved = await resolveSignal(tx, organization.id, openSignal.id)
      expect(resolved && deriveSignalStatus(resolved)).toBe("resolved")

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: executionB.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${executionB.id}:n1`,
      })

      const [regressed] = await listSignals(tx, organization.id)
      expect(regressed.status).toBe("regressed")
      expect(regressed.resolvedAt).toBeNull()
      expect(regressed.occurrenceCount).toBe(2)
    })
  })

  it("links every matching flag to the signal, visible via getSignalDetail", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${execution.id}:n1`,
      })

      const [signal] = await listSignals(tx, organization.id)
      const detail = await getSignalDetail(tx, organization.id, signal.id)
      expect(detail?.flags).toHaveLength(1)
      expect(detail?.flags[0].executionId).toBe(execution.id)
      expect(detail?.trend).toHaveLength(1)
      expect(detail?.trend[0].count).toBe(1)
    })
  })
})

describe("getSignalsTrend", () => {
  it("buckets flags by day across every signal in the workspace, scoped by workspaceId", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const otherOrg = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const today = new Date()
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${execution.id}:n1`,
        createdAt: yesterday,
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "n2",
        flagType: "cost_jump",
        dedupeKey: `cost_jump:${execution.id}:n2`,
        createdAt: today,
      })
      // Belongs to a different workspace — must not bleed into this trend.
      const otherExecution = await createExecution(tx, {
        workspaceId: otherOrg.organization.id,
        workflowId: otherOrg.workflow.id,
        workflowVersionId: otherOrg.version.id,
        trigger: "manual",
      })
      await createFlagIfNew(tx, {
        workspaceId: otherOrg.organization.id,
        executionId: otherExecution.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${otherExecution.id}:n1`,
        createdAt: today,
      })

      const trend = await getSignalsTrend(tx, organization.id)
      expect(trend).toHaveLength(2)
      expect(trend.reduce((sum, point) => sum + point.count, 0)).toBe(2)
    })
  })

  it("filters to a single workflow when workflowId is passed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const suffix = randomUUID()
      const otherWorkflow = await createWorkflow(tx, {
        workspaceId: organization.id,
        name: "Other Workflow",
        slug: `other-workflow-${suffix}`,
      })
      const otherVersion = await createWorkflowVersion(tx, {
        workflowId: otherWorkflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "other-test-hash",
      })
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      const otherExecution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: otherWorkflow.id,
        workflowVersionId: otherVersion.id,
        trigger: "manual",
      })

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${execution.id}:n1`,
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        workflowId: otherWorkflow.id,
        executionId: otherExecution.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${otherExecution.id}:n1`,
      })

      const trend = await getSignalsTrend(tx, organization.id, {
        workflowId: workflow.id,
      })
      expect(trend.reduce((sum, point) => sum + point.count, 0)).toBe(1)
    })
  })

  it("excludes flags older than the requested day window", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const withinWindow = new Date()
      const outsideWindow = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)

      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "n1",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${execution.id}:n1`,
        createdAt: withinWindow,
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "n2",
        flagType: "cost_jump",
        dedupeKey: `cost_jump:${execution.id}:n2`,
        createdAt: outsideWindow,
      })

      const trend = await getSignalsTrend(tx, organization.id, { days: 30 })
      expect(trend.reduce((sum, point) => sum + point.count, 0)).toBe(1)
    })
  })
})
