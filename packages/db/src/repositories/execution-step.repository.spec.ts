import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { checkpoints, executions, executionSteps } from "../schema/index.js"
import {
  claimReplayStep,
  completeReplayStep,
  getExecutionStepById,
  getNextStepSequence,
} from "./execution-step.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function createOriginalStep(
  tx: Transaction,
  executionId: string,
  workspaceId: string
) {
  const [step] = await tx
    .insert(executionSteps)
    .values({
      executionId,
      workspaceId,
      traceId: executionId,
      spanId: "original-span",
      name: "ai",
      startedAt: new Date(),
      endedAt: new Date(),
      status: "succeeded",
      nodeId: "node-1",
      sequence: 1,
      input: { foo: "bar" },
      output: { text: "hello" },
    })
    .returning()
  return step
}

describe("getExecutionStepById", () => {
  it("returns the step, or undefined if it doesn't exist", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const [execution] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          status: "succeeded",
        })
        .returning()
      const step = await createOriginalStep(tx, execution.id, organization.id)

      const found = await getExecutionStepById(tx, step.id)
      expect(found?.id).toBe(step.id)

      const notFound = await getExecutionStepById(
        tx,
        "00000000-0000-0000-0000-000000000000"
      )
      expect(notFound).toBeUndefined()
    })
  })
})

describe("getNextStepSequence", () => {
  it("continues from the highest existing sequence, starting at 1 with none", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const [execution] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          status: "succeeded",
        })
        .returning()

      expect(await getNextStepSequence(tx, execution.id)).toBe(1)

      await createOriginalStep(tx, execution.id, organization.id)
      expect(await getNextStepSequence(tx, execution.id)).toBe(2)
    })
  })
})

describe("claimReplayStep + completeReplayStep", () => {
  it("claims a step row linked via replayedFromStepId, without writing a checkpoint, then completes it", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const [execution] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          status: "succeeded",
        })
        .returning()
      const original = await createOriginalStep(
        tx,
        execution.id,
        organization.id
      )

      const replayId = "11111111-1111-1111-1111-111111111111"
      const claimed = await claimReplayStep(tx, {
        id: replayId,
        executionId: execution.id,
        workspaceId: organization.id,
        traceId: original.traceId,
        parentSpanId: original.spanId,
        nodeId: original.nodeId,
        name: original.name,
        sequence: 2,
        input: original.input,
        replayedFromStepId: original.id,
        startedAt: new Date(),
      })

      expect(claimed?.id).toBe(replayId)
      expect(claimed?.status).toBe("running")
      expect(claimed?.replayedFromStepId).toBe(original.id)
      expect(claimed?.input).toEqual(original.input)
      expect(claimed?.idempotencyKey).toBeNull()

      const checkpointRows = await tx
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.executionId, execution.id))
      expect(checkpointRows).toEqual([])

      await completeReplayStep(tx, replayId, {
        status: "succeeded",
        output: { text: "replayed" },
        costMicros: 100n,
        tokensInput: 10,
        tokensOutput: 5,
        endedAt: new Date(),
      })

      const [completed] = await tx
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.id, replayId))
      expect(completed.status).toBe("succeeded")
      expect(completed.output).toEqual({ text: "replayed" })
      expect(completed.costMicros).toBe(100n)
    })
  })

  it("records a failed replay's error", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const [execution] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          status: "succeeded",
        })
        .returning()
      const original = await createOriginalStep(
        tx,
        execution.id,
        organization.id
      )

      const replayId = "22222222-2222-2222-2222-222222222222"
      await claimReplayStep(tx, {
        id: replayId,
        executionId: execution.id,
        workspaceId: organization.id,
        traceId: original.traceId,
        parentSpanId: original.spanId,
        nodeId: original.nodeId,
        name: original.name,
        sequence: 2,
        input: original.input,
        replayedFromStepId: original.id,
        startedAt: new Date(),
      })
      await completeReplayStep(tx, replayId, {
        status: "failed",
        error: { message: "boom" },
        costMicros: 0n,
        tokensInput: 0,
        tokensOutput: 0,
        endedAt: new Date(),
      })

      const [replay] = await tx
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.id, replayId))
      expect(replay.status).toBe("failed")
      expect(replay.error).toEqual({ message: "boom" })
    })
  })

  it("returns undefined when the id is already claimed, so a redelivered job doesn't re-run the node", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const [execution] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          status: "succeeded",
        })
        .returning()
      const original = await createOriginalStep(
        tx,
        execution.id,
        organization.id
      )

      const replayId = "33333333-3333-3333-3333-333333333333"
      const claimInput = {
        id: replayId,
        executionId: execution.id,
        workspaceId: organization.id,
        traceId: original.traceId,
        parentSpanId: original.spanId,
        nodeId: original.nodeId,
        name: original.name,
        sequence: 2,
        input: original.input,
        replayedFromStepId: original.id,
        startedAt: new Date(),
      }

      const first = await claimReplayStep(tx, claimInput)
      const second = await claimReplayStep(tx, claimInput)

      expect(first?.id).toBe(replayId)
      expect(second).toBeUndefined()
    })
  })
})
