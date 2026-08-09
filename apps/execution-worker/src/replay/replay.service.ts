import { Injectable, Logger } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { workflowGraphSchema } from "@linea/runtime"
import type { WorkflowStepReplayJob } from "@linea/queue"
import { InterpreterService } from "../graph/interpreter.service"

// Deliberately much smaller than REPLAY_CLAIM_STALE_MS (10 min) — this isn't sized to stay
// safely inside the staleness window (a single renewal every few minutes would do that), it's
// sized to bound how long a worker can keep running after another worker has already reclaimed
// its stale claim and started a second invocation. Cancellation (see abortController below) is
// best-effort — the reclaimer can start before this worker's next tick discovers it lost
// ownership — so a tight interval is what keeps that overlap window small.
const REPLAY_HEARTBEAT_INTERVAL_MS = 30_000

/** Thrown when a claim exists but isn't stale yet — signals BullMQ to retry later (see the
 * attempts/backoff on enqueueWorkflowStepReplay) instead of marking this delivery complete,
 * which would stop it from ever being rechecked even if the original owner had died. */
class ReplayClaimPendingError extends Error {
  constructor(replayStepId: string) {
    super(
      `Replay ${replayStepId}: claimed by a not-yet-stale attempt, retrying later`
    )
    this.name = "ReplayClaimPendingError"
  }
}

@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name)

  constructor(private readonly interpreter: InterpreterService) {}

  async replay(job: WorkflowStepReplayJob): Promise<void> {
    const originalStep = await repositories.executionStep.getExecutionStepById(
      db,
      job.originalStepId
    )
    if (!originalStep) {
      this.logger.error(
        `Replay ${job.replayStepId}: original step ${job.originalStepId} not found`
      )
      return
    }

    const execution = await repositories.execution.getExecutionById(
      db,
      originalStep.executionId
    )
    if (!execution) {
      this.logger.error(
        `Replay ${job.replayStepId}: execution ${originalStep.executionId} not found`
      )
      return
    }

    const version = await repositories.workflow.getWorkflowVersionById(
      db,
      execution.workflowVersionId
    )
    if (!version) {
      this.logger.error(
        `Replay ${job.replayStepId}: workflow version ${execution.workflowVersionId} not found`
      )
      return
    }

    const graph = workflowGraphSchema.parse(version.graph)
    const node = graph.nodes.find((n) => n.id === originalStep.nodeId)
    if (!node) {
      this.logger.error(
        `Replay ${job.replayStepId}: node "${originalStep.nodeId}" not found in workflow version ${version.id}`
      )
      return
    }

    const mergedNode = {
      ...node,
      config: { ...node.config, ...job.overrideConfig },
    }

    const sequence = await repositories.executionStep.getNextStepSequence(
      db,
      execution.id
    )
    const startedAt = new Date()

    const claimResult = await repositories.executionStep.claimReplayStep(db, {
      id: job.replayStepId,
      executionId: execution.id,
      workspaceId: execution.workspaceId,
      traceId: originalStep.traceId,
      parentSpanId: originalStep.spanId,
      nodeId: originalStep.nodeId,
      name: originalStep.name,
      sequence,
      input: originalStep.input,
      replayedFromStepId: originalStep.id,
      startedAt,
    })
    if (claimResult.outcome === "finalized") {
      this.logger.log(
        `Replay ${job.replayStepId}: already finalized, nothing to do`
      )
      return
    }
    if (claimResult.outcome === "live") {
      // Must not resolve normally here: BullMQ would mark this delivery complete and never
      // redeliver the job again, even if the claim's original owner actually died and this
      // claim is genuinely stranded. Throwing lets attempts/backoff retry past
      // REPLAY_CLAIM_STALE_MS, at which point it's either finalized for real or reclaimable.
      throw new ReplayClaimPendingError(job.replayStepId)
    }
    const claimed = claimResult.claim

    // Kept renewed for as long as executeNode is in flight, so a legitimately slow node (a
    // long AI completion, a slow HTTP call) never looks abandoned and gets reclaimed out from
    // under it. If renewal ever fails (claim lost to a reclaim), completeReplayStep's own
    // fencing check below is what actually stops a late/duplicate result from persisting —
    // this loop is just what keeps that from happening in the common case.
    let claimToken = claimed.claimToken
    // Tracks whatever renewal tick is currently in flight, so completion can wait for it to
    // settle before reading `claimToken` — otherwise a renewal that lands after executeNode
    // resolves but before its own `.then()` runs would leave `claimToken` stale, and
    // completeReplayStep's fencing would then reject the write against the DB's newer
    // startedAt, silently discarding a real result (later misread by the sweep as abandoned).
    // A tick that finds one already in flight (a slow/stalled DB round-trip outlasting the
    // interval) skips itself instead of starting a second, overlapping renewal — otherwise
    // this single slot would only track the newest one, and an earlier renewal that actually
    // wins its compare-and-swap could resolve (and update claimToken) after that point,
    // unobserved by the wait below.
    let pendingRenewal: Promise<void> | undefined
    // Aborts the in-flight node handler call the moment ownership is lost, instead of letting
    // a duplicate HTTP mutation or billed AI completion run to completion in parallel with
    // whoever reclaimed the claim.
    const abortController = new AbortController()
    const heartbeat = setInterval(() => {
      if (pendingRenewal) return
      pendingRenewal = repositories.executionStep
        .renewReplayClaim(db, job.replayStepId, claimToken)
        .then((renewed) => {
          if (!renewed) {
            this.logger.warn(
              `Replay ${job.replayStepId}: lost claim ownership mid-execution`
            )
            abortController.abort()
            return
          }
          claimToken = renewed
        })
        .catch((error: unknown) => {
          // A renewal that throws (a DB blip, a connection error) proves nothing about
          // whether we still own the claim — treated the same as an explicit loss: we can't
          // confirm ownership, so we stop, rather than letting the handler run to completion
          // on a claim that might already be reclaimed (or age into the sweep's stale check
          // while this attempt is still actually in flight).
          this.logger.error(
            `Replay ${job.replayStepId}: failed to renew claim, aborting`,
            error
          )
          abortController.abort()
        })
        .finally(() => {
          pendingRenewal = undefined
        })
    }, REPLAY_HEARTBEAT_INTERVAL_MS)

    let outcome: {
      status: "succeeded" | "failed"
      output?: Record<string, unknown>
      error?: { message: string; stack?: string }
      tokensInput: number
      tokensOutput: number
    }

    try {
      const result = await this.interpreter.executeNode(
        mergedNode,
        originalStep.input,
        execution.workspaceId,
        abortController.signal
      )
      outcome = {
        status: "succeeded",
        output: result.output as Record<string, unknown>,
        tokensInput: result.tokensInput ?? 0,
        tokensOutput: result.tokensOutput ?? 0,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined
      outcome = {
        status: "failed",
        error: { message, stack },
        tokensInput: 0,
        tokensOutput: 0,
      }
    } finally {
      // No new tick can start after this (clearInterval is synchronous), but one that was
      // already in flight when executeNode resolved might not have updated `claimToken` yet —
      // wait for it so completion always reads the token that matches the DB.
      clearInterval(heartbeat)
      await pendingRenewal
    }

    await repositories.executionStep.completeReplayStep(
      db,
      job.replayStepId,
      claimToken,
      {
        endedAt: new Date(),
        status: outcome.status,
        output: outcome.output,
        error: outcome.error,
        costMicros: 0n,
        tokensInput: outcome.tokensInput,
        tokensOutput: outcome.tokensOutput,
      }
    )
  }
}
