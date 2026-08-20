import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import {
  CheckpointsService,
  LeaseLostError,
} from "../checkpoints/checkpoints.service"
import { AiNode } from "./nodes/ai.node"
import { ApprovalNode } from "./nodes/approval.node"
import { BranchNode } from "./nodes/branch.node"
import { HttpNode } from "./nodes/http.node"
import { NonRetryableError } from "./nodes/non-retryable-error"
import { TransformNode } from "./nodes/transform.node"
import { InterpreterService } from "./interpreter.service"

// A stand-in for a token-producing node handler (e.g. AI), swapped in for HttpNode so the test doesn't need real fetch/provider calls.
const tokenNode = {
  execute: () => Promise.resolve({ tokensInput: 100, tokensOutput: 50 }),
} as unknown as HttpNode

afterAll(async () => {
  await pool.end()
})

describe("InterpreterService.executeNode", () => {
  it("looks up the handler by node type, executes it, and extracts token usage", async () => {
    const interpreter = new InterpreterService(
      new CheckpointsService(),
      tokenNode,
      new TransformNode(),
      new BranchNode(),
      new AiNode(),
      new ApprovalNode()
    )

    const result = await interpreter.executeNode(
      { id: "n1", type: "http", config: { foo: "bar" } },
      { hello: "world" },
      "workspace-1"
    )

    expect(result.output).toEqual({ tokensInput: 100, tokensOutput: 50 })
    expect(result.tokensInput).toBe(100)
    expect(result.tokensOutput).toBe(50)
  })

  it("propagates a handler's rejection without swallowing it", async () => {
    const failingNode = {
      execute: () => Promise.reject(new Error("handler exploded")),
    } as unknown as HttpNode
    const interpreter = new InterpreterService(
      new CheckpointsService(),
      failingNode,
      new TransformNode(),
      new BranchNode(),
      new AiNode(),
      new ApprovalNode()
    )

    await expect(
      interpreter.executeNode(
        { id: "n1", type: "http", config: {} },
        {},
        "workspace-1"
      )
    ).rejects.toThrow("handler exploded")
  })

  it("passes leasedBy through to the handler's execution context", async () => {
    const execute = jest.fn().mockResolvedValue({})
    const capturingNode = { execute } as unknown as HttpNode
    const interpreter = new InterpreterService(
      new CheckpointsService(),
      capturingNode,
      new TransformNode(),
      new BranchNode(),
      new AiNode(),
      new ApprovalNode()
    )

    await interpreter.executeNode(
      { id: "n1", type: "http", config: {} },
      {},
      "workspace-1",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "worker-1"
    )

    expect(execute).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({ leasedBy: "worker-1" })
    )
  })

  it("throws for a node type with no registered handler", async () => {
    const interpreter = new InterpreterService(
      new CheckpointsService(),
      tokenNode,
      new TransformNode(),
      new BranchNode(),
      new AiNode(),
      new ApprovalNode()
    )

    await expect(
      interpreter.executeNode(
        // @ts-expect-error deliberately not a real node type
        { id: "n1", type: "not-a-real-type", config: {} },
        {},
        "workspace-1"
      )
    ).rejects.toThrow('No handler for node type "not-a-real-type"')
  })
})

describe("InterpreterService.run idempotency key", () => {
  it("passes `${executionId}:${nodeId}` as the idempotency key, stable if the same node were reclaimed and re-run", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Idempotency Test Org",
        slug: `interpreter-idempotency-${suffix}`,
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
        name: "Interpreter Idempotency Test Workflow",
        slug: `interpreter-idempotency-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-idempotency-hash",
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

      const executeSpy = jest.fn(() =>
        Promise.resolve({ tokensInput: 0, tokensOutput: 0 })
      )
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const interpreter = new InterpreterService(
        new CheckpointsService(),
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode(),
        new ApprovalNode()
      )

      await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: new Map(),
      })

      const [, , context] = executeSpy.mock.calls[0] as unknown as [
        unknown,
        unknown,
        { idempotencyKey?: string },
      ]
      expect(context.idempotencyKey).toBe(`${execution.id}:n1`)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
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
        new AiNode(),
        new ApprovalNode()
      )

      // First run: executes n1, checkpoints its usage, then "crashes" (never completes).
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

      // Second run: n1 is already checkpointed, so the walker skips it — zero handler calls here.
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

      expect(secondRun.result!.status).toBe("completed")
      expect(secondRun.totalTokensInput).toBe(100)
      expect(secondRun.totalTokensOutput).toBe(50)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("carries an unpriced step's flag into a resumed run that skips it", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Resume Unpriced Test Org",
        slug: `interpreter-resume-unpriced-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "ai", config: { model: "groq/compound" } }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Interpreter Resume Unpriced Test Workflow",
        slug: `interpreter-resume-unpriced-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-resume-unpriced-hash",
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
        new HttpNode(),
        new TransformNode(),
        new BranchNode(),
        tokenNode,
        new ApprovalNode()
      )

      // First run: executes n1 (unpriced), checkpoints it, then "crashes".
      await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: await checkpoints.getResumeState(execution.id),
      })

      const resumeTokens = await checkpoints.getResumeTokenTotals(execution.id)
      expect(resumeTokens.costUnpriced).toBe(true)

      // Second run: n1 is already checkpointed and skipped — the flag must still carry forward.
      const secondRun = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: await checkpoints.getResumeState(execution.id),
        initialTokensInput: resumeTokens.tokensInput,
        initialTokensOutput: resumeTokens.tokensOutput,
        initialCostMicros: resumeTokens.costMicros,
        initialCostUnpriced: resumeTokens.costUnpriced,
      })

      expect(secondRun.result!.status).toBe("completed")
      expect(secondRun.costUnpriced).toBe(true)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("reports unknown, not false, when a resumed execution has a legacy AI step from before cost tracking existed", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Legacy Gap Test Org",
        slug: `interpreter-legacy-gap-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [
          // n1 simulates a step written before cost tracking existed: succeeded, real tokens, no attributes.
          {
            id: "n1",
            type: "ai",
            config: { model: "claude-haiku-4-5-20251001" },
          },
          {
            id: "n2",
            type: "ai",
            config: { model: "claude-haiku-4-5-20251001" },
          },
        ],
        edges: [{ from: "n1", to: "n2" }],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Interpreter Legacy Gap Test Workflow",
        slug: `interpreter-legacy-gap-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-legacy-gap-hash",
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

      // Manually insert n1's step and checkpoint exactly as they'd look pre-feature: no attributes column value at all.
      await db.insert(schema.executionSteps).values({
        executionId: execution.id,
        workspaceId: organization.id,
        traceId: execution.id,
        spanId: "legacy-span",
        name: "ai",
        startedAt: new Date(),
        endedAt: new Date(),
        status: "succeeded",
        nodeId: "n1",
        sequence: 1,
        output: { text: "legacy", tokensInput: 40, tokensOutput: 10 },
        tokensInput: 40,
        tokensOutput: 10,
        costMicros: 0n,
      })
      await db.insert(schema.checkpoints).values({
        executionId: execution.id,
        sequence: 1,
        completedStepIds: ["n1"],
        context: { n1: { text: "legacy", tokensInput: 40, tokensOutput: 10 } },
      })

      const checkpoints = new CheckpointsService()
      const resumeTokens = await checkpoints.getResumeTokenTotals(execution.id)
      expect(resumeTokens.costUnpriced).toBeNull()

      const interpreter = new InterpreterService(
        checkpoints,
        new HttpNode(),
        new TransformNode(),
        new BranchNode(),
        tokenNode,
        new ApprovalNode()
      )

      // n2 runs fresh and is fully priced, but the legacy gap on n1 must still win.
      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: await checkpoints.getResumeState(execution.id),
        initialTokensInput: resumeTokens.tokensInput,
        initialTokensOutput: resumeTokens.tokensOutput,
        initialCostMicros: resumeTokens.costMicros,
        initialCostUnpriced: resumeTokens.costUnpriced,
      })

      expect(outcome.result!.status).toBe("completed")
      expect(outcome.costUnpriced).toBeNull()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("computes and checkpoints AI step cost from the pricing table", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Cost Test Org",
        slug: `interpreter-cost-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [
          {
            id: "n1",
            type: "ai",
            config: { model: "claude-haiku-4-5-20251001" },
          },
        ],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Interpreter Cost Test Workflow",
        slug: `interpreter-cost-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-cost-hash",
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
        new HttpNode(),
        new TransformNode(),
        new BranchNode(),
        tokenNode,
        new ApprovalNode()
      )

      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: await checkpoints.getResumeState(execution.id),
      })

      // claude-haiku-4-5-20251001: 1.0 micros/input token, 5.0 micros/output token — 100*1 + 50*5 = 350.
      expect(outcome.totalCostMicros).toBe(350n)

      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(steps[0]?.costMicros).toBe(350n)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("marks an unpriced model's step as unpriced rather than silently reporting it as free", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Unpriced Cost Test Org",
        slug: `interpreter-unpriced-cost-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "ai", config: { model: "groq/compound" } }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Interpreter Unpriced Cost Test Workflow",
        slug: `interpreter-unpriced-cost-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-unpriced-cost-hash",
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
        new HttpNode(),
        new TransformNode(),
        new BranchNode(),
        tokenNode,
        new ApprovalNode()
      )

      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: await checkpoints.getResumeState(execution.id),
      })

      // groq/compound has no verified rate — totalCostMicros must stay a known-partial 0, not a silent real 0.
      expect(outcome.totalCostMicros).toBe(0n)
      expect(outcome.costUnpriced).toBe(true)

      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(steps[0]?.costMicros).toBe(0n)
      expect(steps[0]?.attributes).toEqual({ costUnpriced: true })
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

      // worker-2 reclaims before worker-1 gets to checkpoint.
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
        new AiNode(),
        new ApprovalNode()
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

      // worker-2 reclaims before worker-1 gets around to running n1.
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
        new AiNode(),
        new ApprovalNode()
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

  it("never invokes a node's side effect once its own lease has expired, even with no reclaim yet", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Expired Lease Test Org",
        slug: `interpreter-expired-lease-${suffix}`,
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
        name: "Interpreter Expired Lease Test Workflow",
        slug: `interpreter-expired-lease-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "interpreter-expired-lease-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      // Nobody has reclaimed this — worker-1 is still the leasedBy of
      // record, but its own heartbeat stalled and the lease already lapsed.
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1_000)
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
        new AiNode(),
        new ApprovalNode()
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

describe("InterpreterService retry policy", () => {
  async function setupExecution(suffix: string, graph: WorkflowGraph) {
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Interpreter Retry Test Org",
        slug: `interpreter-retry-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const workflow = await repositories.workflow.createWorkflow(db, {
      workspaceId: organization.id,
      name: "Interpreter Retry Test Workflow",
      slug: `interpreter-retry-workflow-${suffix}`,
    })
    const version = await repositories.workflow.createWorkflowVersion(db, {
      workflowId: workflow.id,
      graph,
      contentHash: `interpreter-retry-hash-${suffix}`,
    })
    const execution = await repositories.execution.createExecution(db, {
      workspaceId: organization.id,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      trigger: "manual",
      triggerPayload: {},
    })
    return { organization, execution }
  }

  it("retries a failing node and succeeds once the handler stops throwing", async () => {
    const suffix = randomUUID()
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "http",
          config: {
            retryPolicy: {
              maxAttempts: 3,
              backoff: { type: "fixed", delayMs: 10 },
            },
          },
        },
      ],
      edges: [],
    }
    const { organization, execution } = await setupExecution(suffix, graph)
    try {
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      let calls = 0
      const executeSpy = jest.fn(() => {
        calls += 1
        if (calls < 3) return Promise.reject(new Error("flaky"))
        return Promise.resolve({ tokensInput: 0, tokensOutput: 0 })
      })
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const interpreter = new InterpreterService(
        new CheckpointsService(),
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode(),
        new ApprovalNode()
      )

      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: new Map(),
      })

      expect(executeSpy).toHaveBeenCalledTimes(3)
      expect(outcome.result?.status).toBe("completed")

      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(steps[0]?.status).toBe("succeeded")
      expect(steps[0]?.attributes?.retryAttempts).toBe(3)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("fails the step once retries are exhausted, recording how many attempts were made", async () => {
    const suffix = randomUUID()
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "http",
          config: {
            retryPolicy: {
              maxAttempts: 2,
              backoff: { type: "fixed", delayMs: 10 },
            },
          },
        },
      ],
      edges: [],
    }
    const { organization, execution } = await setupExecution(suffix, graph)
    try {
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const executeSpy = jest.fn(() =>
        Promise.reject(new Error("always fails"))
      )
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const interpreter = new InterpreterService(
        new CheckpointsService(),
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode(),
        new ApprovalNode()
      )

      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: new Map(),
      })

      expect(executeSpy).toHaveBeenCalledTimes(2)
      expect(outcome.result?.status).toBe("failed")

      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(steps[0]?.status).toBe("failed")
      expect(steps[0]?.attributes?.retryAttempts).toBe(2)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("does not retry a NonRetryableError, even with attempts remaining", async () => {
    const suffix = randomUUID()
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "http",
          config: {
            retryPolicy: {
              maxAttempts: 5,
              backoff: { type: "fixed", delayMs: 10 },
            },
          },
        },
      ],
      edges: [],
    }
    const { organization, execution } = await setupExecution(suffix, graph)
    try {
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const executeSpy = jest.fn(() =>
        Promise.reject(new NonRetryableError("bad request"))
      )
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const interpreter = new InterpreterService(
        new CheckpointsService(),
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode(),
        new ApprovalNode()
      )

      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: new Map(),
      })

      expect(executeSpy).toHaveBeenCalledTimes(1)
      expect(outcome.result?.status).toBe("failed")

      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(steps[0]?.attributes?.retryAttempts).toBeUndefined()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("aborts the attempt once its own timeout elapses, then retries", async () => {
    const suffix = randomUUID()
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "http",
          config: {
            retryPolicy: {
              maxAttempts: 2,
              backoff: { type: "fixed", delayMs: 10 },
              timeoutMs: 1000,
            },
          },
        },
      ],
      edges: [],
    }
    const { organization, execution } = await setupExecution(suffix, graph)
    try {
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      let calls = 0
      const executeSpy = jest.fn(
        (
          _config: unknown,
          _input: unknown,
          context: { signal?: AbortSignal }
        ) => {
          calls += 1
          if (calls === 1) {
            // Simulate a hung call by waiting for this attempt's own combined signal to abort.
            return new Promise((_resolve, reject) => {
              context.signal?.addEventListener("abort", () =>
                reject(new Error("aborted"))
              )
            })
          }
          return Promise.resolve({ tokensInput: 0, tokensOutput: 0 })
        }
      )
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const interpreter = new InterpreterService(
        new CheckpointsService(),
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode(),
        new ApprovalNode()
      )

      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: new Map(),
      })

      expect(executeSpy).toHaveBeenCalledTimes(2)
      expect(outcome.result?.status).toBe("completed")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  }, 15_000)

  it("stops retrying and surfaces a lease loss once the lease expires between attempts", async () => {
    const suffix = randomUUID()
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "http",
          config: {
            retryPolicy: {
              maxAttempts: 3,
              backoff: { type: "fixed", delayMs: 10 },
            },
          },
        },
      ],
      edges: [],
    }
    const { organization, execution } = await setupExecution(suffix, graph)
    try {
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      // The first attempt's failure expires the lease itself (standing in for a real reclaim
      // during that call), deterministically, instead of racing real wall-clock timing.
      const executeSpy = jest.fn(async () => {
        await pool.query(
          "UPDATE executions SET lease_expires_at = $1 WHERE id = $2",
          [new Date(Date.now() - 1000), execution.id]
        )
        throw new Error("flaky")
      })
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const interpreter = new InterpreterService(
        new CheckpointsService(),
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode(),
        new ApprovalNode()
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

      expect(executeSpy).toHaveBeenCalledTimes(1)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("behaves exactly as before when no retryPolicy is configured", async () => {
    const suffix = randomUUID()
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "n1",
      nodes: [{ id: "n1", type: "http", config: {} }],
      edges: [],
    }
    const { organization, execution } = await setupExecution(suffix, graph)
    try {
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const executeSpy = jest.fn(() => Promise.reject(new Error("fails")))
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const interpreter = new InterpreterService(
        new CheckpointsService(),
        spyNode,
        new TransformNode(),
        new BranchNode(),
        new AiNode(),
        new ApprovalNode()
      )

      const outcome = await interpreter.run({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        graph,
        triggerPayload: {},
        resumeFrom: new Map(),
      })

      expect(executeSpy).toHaveBeenCalledTimes(1)
      expect(outcome.result?.status).toBe("failed")

      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(steps[0]?.attributes?.retryAttempts).toBeUndefined()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
