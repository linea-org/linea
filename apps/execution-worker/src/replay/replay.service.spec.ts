import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { AiNode } from "../graph/nodes/ai.node"
import { BranchNode } from "../graph/nodes/branch.node"
import type { HttpNode } from "../graph/nodes/http.node"
import { TransformNode } from "../graph/nodes/transform.node"
import { InterpreterService } from "../graph/interpreter.service"
import { ReplayService } from "./replay.service"

afterAll(async () => {
  await pool.end()
})

async function setUpExecutionWithStep(
  organizationId: string,
  overrides: { httpNode: HttpNode }
) {
  const suffix = randomUUID()
  const graph: WorkflowGraph = {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "n1",
    nodes: [{ id: "n1", type: "http", config: { url: "https://example.com" } }],
    edges: [],
  }
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organizationId,
    name: "Replay Test Workflow",
    slug: `replay-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph,
    contentHash: `replay-hash-${suffix}`,
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: organizationId,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
    triggerPayload: {},
  })
  await repositories.execution.startExecution(
    db,
    execution.id,
    "setup-worker",
    new Date(Date.now() + 60_000)
  )
  await repositories.execution.completeExecution(
    db,
    execution.id,
    "setup-worker",
    { status: "succeeded", costMicros: 0n, tokensInput: 0, tokensOutput: 0 }
  )

  const [originalStep] = await db
    .insert(schema.executionSteps)
    .values({
      executionId: execution.id,
      workspaceId: organizationId,
      traceId: execution.id,
      spanId: "original-span",
      name: "http",
      startedAt: new Date(),
      endedAt: new Date(),
      status: "succeeded",
      nodeId: "n1",
      sequence: 1,
      input: { trigger: "original" },
      output: { status: 200, body: { original: true } },
    })
    .returning()

  const interpreter = new InterpreterService(
    new CheckpointsService(),
    overrides.httpNode,
    new TransformNode(),
    new BranchNode(),
    new AiNode()
  )
  const replay = new ReplayService(interpreter)

  return { execution, originalStep, replay }
}

describe("ReplayService.replay", () => {
  it("inserts a succeeded step linked to the original, with the original's input and a merged config", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Replay Test Org",
        slug: `replay-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const executeSpy = jest.fn(() =>
        Promise.resolve({ status: 200, body: { replayed: true } })
      )
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const { execution, originalStep, replay } = await setUpExecutionWithStep(
        organization.id,
        { httpNode: spyNode }
      )

      const replayStepId = randomUUID()
      await replay.replay({
        replayStepId,
        originalStepId: originalStep.id,
        overrideConfig: { url: "https://overridden.example.com" },
      })

      expect(executeSpy).toHaveBeenCalledWith(
        { url: "https://overridden.example.com" },
        originalStep.input,
        { workspaceId: organization.id }
      )

      const result = await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      )
      const replayRow = result?.steps.find((s) => s.id === replayStepId)
      expect(replayRow).toBeDefined()
      expect(replayRow?.status).toBe("succeeded")
      expect(replayRow?.replayedFromStepId).toBe(originalStep.id)
      expect(replayRow?.input).toEqual(originalStep.input)
      expect(replayRow?.output).toEqual({
        status: 200,
        body: { replayed: true },
      })
      expect(replayRow?.traceId).toBe(originalStep.traceId)
      expect(replayRow?.parentSpanId).toBe(originalStep.spanId)
      expect(replayRow?.idempotencyKey).toBeNull()

      // The original execution's own aggregates are untouched by a replay.
      const untouchedExecution = await repositories.execution.getExecutionById(
        db,
        execution.id
      )
      expect(untouchedExecution?.costMicros).toBe(0n)
      expect(untouchedExecution?.status).toBe("succeeded")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("records a failed replay's error instead of throwing", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Replay Failure Test Org",
        slug: `replay-failure-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const failingNode = {
        execute: () => Promise.reject(new Error("provider unreachable")),
      } as unknown as HttpNode
      const { execution, originalStep, replay } = await setUpExecutionWithStep(
        organization.id,
        { httpNode: failingNode }
      )

      const replayStepId = randomUUID()
      await replay.replay({
        replayStepId,
        originalStepId: originalStep.id,
        overrideConfig: {},
      })

      const result = await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      )
      const replayRow = result?.steps.find((s) => s.id === replayStepId)
      expect(replayRow?.status).toBe("failed")
      expect(replayRow?.error?.message).toBe("provider unreachable")
      expect(typeof replayRow?.error?.stack).toBe("string")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("does not re-execute the node when the same replayStepId is redelivered", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Replay Redelivery Test Org",
        slug: `replay-redelivery-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const executeSpy = jest.fn(() =>
        Promise.resolve({ status: 200, body: { replayed: true } })
      )
      const spyNode = { execute: executeSpy } as unknown as HttpNode
      const { execution, originalStep, replay } = await setUpExecutionWithStep(
        organization.id,
        { httpNode: spyNode }
      )

      const replayStepId = randomUUID()
      const job = {
        replayStepId,
        originalStepId: originalStep.id,
        overrideConfig: {},
      }

      // Simulates BullMQ redelivering the same job after a stalled lock — the
      // second call must not fire the node's side effect a second time.
      await replay.replay(job)
      await replay.replay(job)

      expect(executeSpy).toHaveBeenCalledTimes(1)

      const result = await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      )
      const replayRows = result?.steps.filter((s) => s.id === replayStepId)
      expect(replayRows).toHaveLength(1)
      expect(replayRows?.[0]?.status).toBe("succeeded")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
