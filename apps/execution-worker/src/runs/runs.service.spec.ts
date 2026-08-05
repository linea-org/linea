import "../env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import type { InterpreterService } from "../graph/interpreter.service"
import { RunLeaseService } from "./run-lease.service"
import { RunsService } from "./runs.service"

afterAll(async () => {
  await pool.end()
})

describe("RunsService failure accounting", () => {
  it("preserves previously checkpointed token usage when a resumed run fails outright", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Fail Test Org",
        slug: `runs-fail-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "transform", config: { expression: "" } }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Fail Test Workflow",
        slug: `runs-fail-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-fail-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      // A prior (abandoned) attempt already checkpointed real token usage,
      // then its lease expired without completing.
      const checkpoints = new CheckpointsService()
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-0-abandoned",
        new Date(Date.now() - 1_000)
      )
      await checkpoints.recordStep({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-0-abandoned",
        nodeId: "n1",
        nodeType: "transform",
        input: {},
        output: {},
        startedAt: new Date(),
        endedAt: new Date(),
        tokensInput: 100,
        tokensOutput: 50,
        completed: new Map([["n1", {}]]),
      })

      // The resuming worker's interpreter fails outright (e.g. a persistence
      // or lease-loss error) before returning any outcome of its own.
      const poisonInterpreter = {
        run: () => Promise.reject(new Error("simulated failure after resume")),
      } as unknown as InterpreterService

      const runs = new RunsService(
        checkpoints,
        poisonInterpreter,
        new RunLeaseService()
      )

      await expect(runs.execute(execution.id)).rejects.toThrow(
        "simulated failure after resume"
      )

      const [finalExecution] = await repositories.execution.listExecutions(
        db,
        workflow.id,
        { limit: 1 }
      )
      expect(finalExecution.status).toBe("failed")
      expect(finalExecution.tokensInput).toBe(100)
      expect(finalExecution.tokensOutput).toBe(50)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
