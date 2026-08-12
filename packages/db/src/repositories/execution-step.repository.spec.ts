import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { checkpoints, executions, executionSteps } from "../schema/index.js"
import {
  claimReplayStep,
  completeReplayStep,
  getExecutionStepById,
  getNextStepSequence,
  renewReplayClaim,
  type ClaimReplayStepResult,
  type ReplayClaim,
} from "./execution-step.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

function expectClaimed(result: ClaimReplayStepResult): ReplayClaim {
  if (result.outcome !== "claimed") {
    throw new Error(`expected outcome "claimed", got "${result.outcome}"`)
  }
  return result.claim
}

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
      const claimed = expectClaimed(
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
      )

      expect(claimed.step.id).toBe(replayId)
      expect(claimed.step.status).toBe("running")
      expect(claimed.step.replayedFromStepId).toBe(original.id)
      expect(claimed.step.input).toEqual(original.input)
      expect(claimed.step.idempotencyKey).toBeNull()
      expect(claimed.claimToken).toEqual(claimed.step.startedAt)

      const checkpointRows = await tx
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.executionId, execution.id))
      expect(checkpointRows).toEqual([])
      await completeReplayStep(tx, replayId, claimed.claimToken, {
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
      const claimed = expectClaimed(
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
      )
      await completeReplayStep(tx, replayId, claimed.claimToken, {
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

  it('reports "live" for a non-stale claim, so a redelivered job doesn\'t re-run the node but knows to retry later', async () => {
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

      const first = expectClaimed(await claimReplayStep(tx, claimInput))
      const second = await claimReplayStep(tx, claimInput)

      expect(first.step.id).toBe(replayId)
      expect(second).toEqual({ outcome: "live" })
    })
  })

  it('reports "finalized" once the claim is done, even long after completion', async () => {
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

      const replayId = "44444444-4444-4444-4444-444444444444"
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
      const claimed = expectClaimed(await claimReplayStep(tx, claimInput))
      await completeReplayStep(tx, replayId, claimed.claimToken, {
        status: "succeeded",
        output: { text: "done" },
        costMicros: 0n,
        tokensInput: 0,
        tokensOutput: 0,
        endedAt: new Date(),
      })

      // Backdate startedAt well past the staleness window — a finalized claim must never be
      // reclaimed, no matter how old, since re-running it would repeat a real side effect.
      await tx
        .update(executionSteps)
        .set({ startedAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(executionSteps.id, replayId))

      expect(await claimReplayStep(tx, claimInput)).toEqual({
        outcome: "finalized",
      })
    })
  })

  it("reclaims a stale claim via a fresh startedAt, and fences out a late completion from the abandoned attempt", async () => {
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

      const replayId = "55555555-5555-5555-5555-555555555555"
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
      const abandoned = expectClaimed(await claimReplayStep(tx, claimInput))

      // Simulate the claiming worker dying: back the claim's startedAt off past the
      // staleness window without ever completing it.
      await tx
        .update(executionSteps)
        .set({ startedAt: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(executionSteps.id, replayId))

      const reclaimed = expectClaimed(await claimReplayStep(tx, claimInput))
      expect(reclaimed.step.id).toBe(replayId)
      expect(reclaimed.step.status).toBe("running")
      expect(reclaimed.claimToken).not.toEqual(abandoned.claimToken)
      // A real takeover, not a renewal, must visibly bump attempt so the trace shows this wasn't a first try.
      expect(reclaimed.step.attempt).toBe(2)

      // The reclaimer finishes and records its result.
      await completeReplayStep(tx, replayId, reclaimed.claimToken, {
        status: "succeeded",
        output: { text: "from reclaimer" },
        costMicros: 0n,
        tokensInput: 0,
        tokensOutput: 0,
        endedAt: new Date(),
      })

      // The original (abandoned) attempt finally finishes and tries to record its own,
      // stale result — it must be silently dropped, not overwrite the reclaimer's.
      await completeReplayStep(tx, replayId, abandoned.claimToken, {
        status: "succeeded",
        output: { text: "from zombie" },
        costMicros: 0n,
        tokensInput: 0,
        tokensOutput: 0,
        endedAt: new Date(),
      })

      const [final] = await tx
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.id, replayId))
      expect(final.output).toEqual({ text: "from reclaimer" })
    })
  })
})

describe("renewReplayClaim", () => {
  it("renews a live claim, and the new token is what completeReplayStep must use", async () => {
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

      const replayId = "66666666-6666-6666-6666-666666666666"
      const claimed = expectClaimed(
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
      )

      const renewal = await renewReplayClaim(tx, replayId, claimed.claimToken)
      if (renewal.outcome !== "renewed") {
        throw new Error(`expected outcome "renewed", got "${renewal.outcome}"`)
      }
      const renewedToken = renewal.claimToken
      expect(renewedToken).not.toEqual(claimed.claimToken)

      // A renewal is the same owner checking in, not a takeover — attempt must stay 1.
      const [afterRenewal] = await tx
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.id, replayId))
      expect(afterRenewal.attempt).toBe(1)

      // Completing with the stale, pre-renewal token must not match — proving the renewed
      // token, not the original one, is now what fences the eventual completion.
      await completeReplayStep(tx, replayId, claimed.claimToken, {
        status: "succeeded",
        output: { text: "wrong token" },
        costMicros: 0n,
        tokensInput: 0,
        tokensOutput: 0,
        endedAt: new Date(),
      })
      const [afterWrongToken] = await tx
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.id, replayId))
      expect(afterWrongToken.status).toBe("running")

      await completeReplayStep(tx, replayId, renewedToken, {
        status: "succeeded",
        output: { text: "right token" },
        costMicros: 0n,
        tokensInput: 0,
        tokensOutput: 0,
        endedAt: new Date(),
      })
      const [afterRightToken] = await tx
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.id, replayId))
      expect(afterRightToken.status).toBe("succeeded")
      expect(afterRightToken.output).toEqual({ text: "right token" })
    })
  })

  it("returns 'finalized' once the claim completed, since startedAt never moved and no other owner exists", async () => {
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

      const replayId = "77777777-7777-7777-7777-777777777777"
      const claimed = expectClaimed(
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
      )
      await completeReplayStep(tx, replayId, claimed.claimToken, {
        status: "succeeded",
        output: { text: "done" },
        costMicros: 0n,
        tokensInput: 0,
        tokensOutput: 0,
        endedAt: new Date(),
      })

      expect(await renewReplayClaim(tx, replayId, claimed.claimToken)).toEqual({
        outcome: "finalized",
      })
    })
  })

  it("returns 'reclaimed' once startedAt has moved to a different owner's token", async () => {
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

      const replayId = "88888888-8888-8888-8888-888888888888"
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
      const abandoned = expectClaimed(await claimReplayStep(tx, claimInput))

      // Same "worker died" simulation as the claimReplayStep reclaim test above.
      await tx
        .update(executionSteps)
        .set({ startedAt: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(executionSteps.id, replayId))
      expectClaimed(await claimReplayStep(tx, claimInput))

      expect(
        await renewReplayClaim(tx, replayId, abandoned.claimToken)
      ).toEqual({ outcome: "reclaimed" })
    })
  })
})
