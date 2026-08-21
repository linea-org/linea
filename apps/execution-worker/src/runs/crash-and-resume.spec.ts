import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "../graph/interpreter.service"
import { AiNode } from "../graph/nodes/ai.node"
import { ApprovalNode } from "../graph/nodes/approval.node"
import { MemoryNode } from "../graph/nodes/memory.node"
import { BranchNode } from "../graph/nodes/branch.node"
import { HttpNode } from "../graph/nodes/http.node"
import { TransformNode } from "../graph/nodes/transform.node"
import { RunLeaseService } from "./run-lease.service"
import { RunsService } from "./runs.service"

function buildLinearTransformGraph(nodeCount: number): WorkflowGraph {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i + 1}`,
    type: "transform" as const,
    config: { expression: i === 0 ? "" : "output" },
  }))
  const edges = nodes
    .slice(0, -1)
    .map((node, i) => ({ from: node.id, to: nodes[i + 1].id }))

  return {
    version: 1 as const,
    trigger: { type: "manual" as const },
    entryNodeId: nodes[0].id,
    nodes,
    edges,
  }
}

afterAll(async () => {
  await pool.end()
})

describe("crash-and-resume", () => {
  it("resumes a 6-step workflow from its last checkpoint without re-executing completed steps", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Crash Resume Test Org",
        slug: `crash-resume-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph = buildLinearTransformGraph(6)
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Crash Resume Test Workflow",
        slug: `crash-resume-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "crash-resume-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: { value: "start" },
      })

      const checkpoints = new CheckpointsService()

      // Worker 1 claims with a live lease, gets through 3 of 6 nodes, then dies.
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1-doomed",
        new Date(Date.now() + 60_000)
      )

      const transformNode = new TransformNode()
      const completedBeforeCrash = new Map<string, unknown>()
      let currentInput: unknown = execution.triggerPayload
      for (const node of graph.nodes.slice(0, 3)) {
        const startedAt = new Date()
        const output = await transformNode.execute(node.config, currentInput)
        completedBeforeCrash.set(node.id, output)
        await checkpoints.recordStep({
          executionId: execution.id,
          workspaceId: organization.id,
          leasedBy: "worker-1-doomed",
          nodeId: node.id,
          nodeType: node.type,
          input: currentInput,
          output,
          startedAt,
          endedAt: new Date(),
          completed: completedBeforeCrash,
        })
        currentInput = output
      }

      // Now it dies — heartbeat stops, lease ages out.
      await pool.query(
        "UPDATE executions SET lease_expires_at = $1 WHERE id = $2",
        [new Date(Date.now() - 1_000), execution.id]
      )

      // Worker 2 ("the restart") resumes it through the real, complete path.
      const interpreter = new InterpreterService(
        checkpoints,
        new HttpNode(),
        transformNode,
        new BranchNode(),
        new AiNode(),
        new ApprovalNode(),
        new MemoryNode()
      )
      const runs = new RunsService(
        checkpoints,
        interpreter,
        new RunLeaseService()
      )
      await runs.execute(execution.id)

      const [finalExecution] = await repositories.execution.listExecutions(
        db,
        workflow.id,
        { limit: 1 }
      )
      // getExecutionWithSteps, not getStepsForExecution — it's the one that orders
      // chronologically by startedAt, which is what the resume marker's position proves.
      const { steps } = (await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      ))!

      const executedNodeIds = steps.map((step) => step.nodeId)
      expect(executedNodeIds).toEqual([
        "n1",
        "n2",
        "n3",
        repositories.checkpoint.RESUME_EVENT_NODE_ID,
        "n4",
        "n5",
        "n6",
      ])
      expect(new Set(executedNodeIds).size).toBe(7)
      expect(steps.every((step) => step.status === "succeeded")).toBe(true)

      const lastStep = steps[steps.length - 1]
      expect(lastStep.output).toEqual({ output: { value: "start" } })

      expect(finalExecution.status).toBe("succeeded")
      expect(finalExecution.leasedBy).not.toBe("worker-1-doomed")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
