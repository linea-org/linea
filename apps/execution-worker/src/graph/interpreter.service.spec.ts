import "../env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import {
  CheckpointsService,
  LeaseLostError,
} from "../checkpoints/checkpoints.service"
import { AiNode } from "./nodes/ai.node"
import { BranchNode } from "./nodes/branch.node"
import type { HttpNode } from "./nodes/http.node"
import { TransformNode } from "./nodes/transform.node"
import { InterpreterService } from "./interpreter.service"

// A stand-in for a token-producing node handler (e.g. AI), swapped in for
// HttpNode so the test doesn't need real fetch/provider calls.
const tokenNode = {
  execute: () => Promise.resolve({ tokensInput: 100, tokensOutput: 50 }),
} as unknown as HttpNode

afterAll(async () => {
  await pool.end()
})

describe("InterpreterService resume", () => {
  it("carries prior checkpointed token usage into a resumed run that re-executes nothing", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Resume Test Org",
        slug: `interpreter-resume-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "http", config: {} }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Interpreter Resume Test Workflow",
        slug: `interpreter-resume-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-resume-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const checkpoints = new CheckpointsService()
      const interpreter = new InterpreterService(
        checkpoints,
        tokenNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode()
      )

      // First run: executes n1, checkpoints its token usage, then "crashes"
      // (nothing else happens — no completion is ever recorded).
      const firstRun = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: await checkpoints.getResumeState(execution.id),
      })
      expect(firstRun.totalTokensInput).toBe(100)
      expect(firstRun.totalTokensOutput).toBe(50)

      // Second run ("the restart"): n1 is already checkpointed, so the walker
      // skips it entirely — zero handler calls happen in this run. Without
      // seeding from the prior checkpoint, totals would come back as 0.
      const resumeFrom = await checkpoints.getResumeState(execution.id)
      const resumeTokens = await checkpoints.getResumeTokenTotals(execution.id)
      const secondRun = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom,
        initialTokensInput: resumeTokens.tokensInput,
        initialTokensOutput: resumeTokens.tokensOutput,
      })

      expect(secondRun.result.status).toBe("completed")
      expect(secondRun.totalTokensInput).toBe(100)
      expect(secondRun.totalTokensOutput).toBe(50)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("refuses to checkpoint a step for a worker that lost the lease mid-run", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Fencing Test Org",
        slug: `interpreter-fencing-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "http", config: {} }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Interpreter Fencing Test Workflow",
        slug: `interpreter-fencing-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-fencing-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      // worker-1 claims it, but its lease is already stale by the time it
      // tries to checkpoint — worker-2 reclaimed the execution in the gap.
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1_000)
      )
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      const checkpoints = new CheckpointsService()
      const interpreter = new InterpreterService(
        checkpoints,
        tokenNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode()
      )

      await expect(
        interpreter.run({
          executionId: execution.id,
          workspaceId: organization.id,
          leasedBy: "worker-1",
          graph,
          triggerPayload: {},
          resumeFrom: new Map(),
        })
      ).rejects.toThrow(LeaseLostError)

      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(steps).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("never invokes a node's side effect for a worker that already lost the lease", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter No-Sideeffect Test Org",
        slug: `interpreter-no-sideeffect-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "http", config: {} }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Interpreter No-Sideeffect Test Workflow",
        slug: `interpreter-no-sideeffect-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-no-sideeffect-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      // worker-2 has already reclaimed by the time worker-1 gets around to
      // running n1 — its own lease was never renewed in time.
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1_000)
      )
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      const executeSpy = jest.fn(() =>
        Promise.resolve({ tokensInput: 100, tokensOutput: 50 })
      )
      const spyNode = { execute: executeSpy } as unknown as HttpNode

      const checkpoints = new CheckpointsService()
      const interpreter = new InterpreterService(
        checkpoints,
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode()
      )

      await expect(
        interpreter.run({
          executionId: execution.id,
          workspaceId: organization.id,
          leasedBy: "worker-1",
          graph,
          triggerPayload: {},
          resumeFrom: new Map(),
        })
      ).rejects.toThrow(LeaseLostError)

      expect(executeSpy).not.toHaveBeenCalled()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
