import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { ReplayClaimSweepService } from "./replay-claim-sweep.service"

afterAll(async () => {
  await pool.end()
})

const graph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "n1",
  nodes: [{ id: "n1", type: "http", config: { url: "https://example.com" } }],
  edges: [],
}

async function setUpExecutionWithOriginalStep(name: string) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name, slug: `${name}-${suffix}`, createdAt: new Date() })
    .returning()

  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Replay Sweep Workflow",
    slug: `replay-sweep-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph,
    contentHash: `replay-sweep-hash-${suffix}`,
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
    triggerPayload: {},
  })
  const [originalStep] = await db
    .insert(schema.executionSteps)
    .values({
      executionId: execution.id,
      workspaceId: organization.id,
      traceId: execution.id,
      spanId: "original-span",
      name: "http",
      startedAt: new Date(),
      endedAt: new Date(),
      status: "succeeded",
      nodeId: "n1",
      sequence: 1,
      input: { trigger: "original" },
      output: { status: 200 },
    })
    .returning()

  return { organization, execution, originalStep }
}

async function claimAt(
  replayId: string,
  execution: { id: string; workspaceId: string },
  originalStep: {
    id: string
    traceId: string
    spanId: string
    nodeId: string
    name: string
  },
  startedAt: Date
) {
  const result = await repositories.executionStep.claimReplayStep(db, {
    id: replayId,
    executionId: execution.id,
    workspaceId: execution.workspaceId,
    traceId: originalStep.traceId,
    parentSpanId: originalStep.spanId,
    nodeId: originalStep.nodeId,
    name: originalStep.name,
    sequence: 2,
    input: { trigger: "original" },
    replayedFromStepId: originalStep.id,
    startedAt,
  })
  if (result.outcome !== "claimed") {
    throw new Error(`expected a fresh claim, got "${result.outcome}"`)
  }
  return result.claim
}

describe("ReplayClaimSweepService", () => {
  it("finalizes a replay claim stale past REPLAY_CLAIM_STALE_MS as failed", async () => {
    const { organization, execution, originalStep } =
      await setUpExecutionWithOriginalStep("Replay Sweep Stale Org")

    try {
      const replayId = randomUUID()
      await claimAt(
        replayId,
        execution,
        originalStep,
        new Date(
          Date.now() - repositories.executionStep.REPLAY_CLAIM_STALE_MS - 1000
        )
      )

      const service = new ReplayClaimSweepService()
      await service.sweep()

      const result = await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      )
      const swept = result?.steps.find((s) => s.id === replayId)
      expect(swept?.status).toBe("failed")
      expect(swept?.error?.message).toMatch(/abandoned/i)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("leaves a non-stale running claim alone", async () => {
    const { organization, execution, originalStep } =
      await setUpExecutionWithOriginalStep("Replay Sweep Fresh Org")

    try {
      const replayId = randomUUID()
      await claimAt(replayId, execution, originalStep, new Date())

      const service = new ReplayClaimSweepService()
      await service.sweep()

      const result = await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      )
      const untouched = result?.steps.find((s) => s.id === replayId)
      expect(untouched?.status).toBe("running")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("leaves an ordinary (non-replay) running step alone", async () => {
    const { organization, execution } = await setUpExecutionWithOriginalStep(
      "Replay Sweep Non-Replay Org"
    )

    try {
      const [runningStep] = await db
        .insert(schema.executionSteps)
        .values({
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "in-flight-span",
          name: "http",
          startedAt: new Date(
            Date.now() - repositories.executionStep.REPLAY_CLAIM_STALE_MS - 1000
          ),
          status: "running",
          nodeId: "n1",
          sequence: 2,
          input: { trigger: "original" },
        })
        .returning()

      const service = new ReplayClaimSweepService()
      await service.sweep()

      const result = await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      )
      const untouched = result?.steps.find((s) => s.id === runningStep.id)
      expect(untouched?.status).toBe("running")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
