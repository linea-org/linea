import { createTestExecution } from "@linealabs/db/testing"
import { getTestApplicationId } from "@linealabs/db/testing"
import "dotenv/config"
import { randomUUID } from "node:crypto"
import { Logger } from "@nestjs/common"
import { db, pool, repositories, schema } from "@linealabs/db"
import {
  createFlaggerWorkspace,
  deleteFlaggerWorkspace,
} from "./flagger-workspace.fixture"
import { GraphFlaggersService } from "./graph-flaggers.service"

afterAll(async () => {
  await pool.end()
})

describe("GraphFlaggersService.sweep, branch never taken", () => {
  it("flags a branch condition that's never been observed, not one that has", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Graph Flaggers Test Org",
        slug: `graph-flaggers-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const graph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "b1",
        nodes: [
          { id: "b1", type: "branch", config: {} },
          { id: "yes-leaf", type: "transform", config: {} },
          { id: "no-leaf", type: "transform", config: {} },
        ],
        edges: [
          { from: "b1", to: "yes-leaf", condition: "yes" },
          { from: "b1", to: "no-leaf", condition: "no" },
        ],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        applicationId: await getTestApplicationId(db, organization.id),
        workspaceId: organization.id,
        name: "Graph Flaggers Test Workflow",
        slug: `graph-flaggers-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: `graph-flaggers-hash-${suffix}`,
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id
      )
      const execution = await createTestExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })
      // Only the "yes" branch was ever taken — "no" should get flagged.
      await db.insert(schema.executionSteps).values({
        executionId: execution.id,
        workspaceId: organization.id,
        traceId: execution.id,
        spanId: "branch-span",
        name: "branch",
        nodeId: "b1",
        sequence: 1,
        startedAt: new Date(),
        status: "succeeded",
        output: { branch: "yes" },
      })
      const service = new GraphFlaggersService()
      await service.sweep()
      const allFlags = await db.select().from(schema.flags)
      const flagRows = allFlags.filter(
        (f) =>
          f.workflowId === workflow.id && f.flagType === "branch_never_taken"
      )
      expect(flagRows).toHaveLength(1)
      expect(flagRows[0]?.nodeId).toBe("b1")
      expect(flagRows[0]?.detail).toEqual({ condition: "no" })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})

describe("GraphFlaggersService.sweep", () => {
  it("still flags other workspaces when one is deleted mid-sweep", async () => {
    const doomed = await createFlaggerWorkspace("Deleted Mid Sweep")
    const survivor = await createFlaggerWorkspace("Survivor")
    const errorLog = jest.spyOn(Logger.prototype, "error").mockImplementation()
    try {
      await db.insert(schema.executionSteps).values({
        executionId: doomed.execution.id,
        workspaceId: doomed.organization.id,
        traceId: doomed.execution.id,
        startedAt: new Date(),
        spanId: "retried-span",
        name: "http",
        nodeId: "n1",
        sequence: 1,
        attempt: 3,
        status: "succeeded",
      })
      await db.insert(schema.executionSteps).values(
        [1, 2, 3].map((sequence) => ({
          executionId: survivor.execution.id,
          workspaceId: survivor.organization.id,
          traceId: survivor.execution.id,
          spanId: `resumed-span-${sequence}`,
          name: "resumed",
          nodeId: "__resumed__",
          sequence,
          attempt: sequence,
          isSystemEvent: true,
          startedAt: new Date(),
          status: "succeeded" as const,
        }))
      )
      jest.spyOn(db, "transaction").mockImplementationOnce(async (run) => {
        await deleteFlaggerWorkspace(doomed.organization.id)
        return db.transaction(run)
      })

      await new GraphFlaggersService().sweep()

      const allFlags = await db.select().from(schema.flags)
      const flags = allFlags.filter(
        (f) =>
          f.executionId === doomed.execution.id ||
          f.executionId === survivor.execution.id
      )
      expect(flags.map((f) => [f.executionId, f.flagType])).toEqual([
        [survivor.execution.id, "excess_resumes"],
      ])
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `retry_storm:${doomed.execution.id}:n1.*signals_workspace_id_organizations_id_fkey`
          )
        )
      )
    } finally {
      jest.restoreAllMocks()
      await deleteFlaggerWorkspace(doomed.organization.id)
      await deleteFlaggerWorkspace(survivor.organization.id)
    }
  })
})
