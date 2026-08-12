import { Injectable, Logger } from "@nestjs/common"
import { calculateCostMicros } from "@linea/ai"
import { db, repositories } from "@linea/db"
import { workflowGraphSchema } from "@linea/runtime"
import type { WorkflowStepReplayJob } from "@linea/queue"
import { InterpreterService } from "../graph/interpreter.service"

// Sized to bound how long this worker can keep running after another worker reclaims its stale claim, not to safely undercut REPLAY_CLAIM_STALE_MS — cancellation below is best-effort, so a tight interval limits the overlap.
const REPLAY_HEARTBEAT_INTERVAL_MS = 30_000

/** Thrown instead of resolving, so BullMQ retries past REPLAY_CLAIM_STALE_MS rather than marking this delivery permanently done. */
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
      // Must throw, not resolve — resolving marks this BullMQ delivery permanently done, even if the claim is genuinely stranded and needs a later retry.
      throw new ReplayClaimPendingError(job.replayStepId)
    }
    const claimed = claimResult.claim
    if (claimed.step.attempt > 1) {
      // attempt only grows on a real reclaim (see casClaimStartedAt), never a same-owner renewal, so this is a genuine takeover from a claim that looked abandoned.
      this.logger.warn(
        `Replay ${job.replayStepId}: reclaimed a stale claim, this is attempt ${claimed.step.attempt}`
      )
    }
    // Renewed for as long as executeNode runs, so a slow AI/HTTP call isn't mistaken for abandoned; completeReplayStep's own fencing is the real backstop if renewal ever loses the claim.
    let claimToken = claimed.claimToken
    // Skips a tick if a renewal is already in flight, and completion always awaits it before reading claimToken — otherwise a late-resolving renewal could leave claimToken stale and completeReplayStep would wrongly fence out a real result.
    let pendingRenewal: Promise<void> | undefined
    // Aborts the in-flight node handler the instant ownership is lost, so a duplicate HTTP mutation or billed AI call doesn't keep running alongside whoever reclaimed the work.
    const abortController = new AbortController()
    const heartbeat = setInterval(() => {
      if (pendingRenewal) return
      pendingRenewal = repositories.executionStep
        .renewReplayClaim(db, job.replayStepId, claimToken)
        .then((result) => {
          if (result.outcome === "renewed") {
            claimToken = result.claimToken
            return
          }
          if (result.outcome === "reclaimed") {
            this.logger.warn(
              `Replay ${job.replayStepId}: lost claim ownership mid-execution`
            )
            abortController.abort()
            return
          }
          // "finalized": the sweep marked this stale with no other owner — claimToken is still valid, so keep running and let the real result overwrite it on completion.
          this.logger.warn(
            `Replay ${job.replayStepId}: sweep finalized this claim while still running, continuing`
          )
        })
        .catch((error: unknown) => {
          // Deliberately doesn't abort — a renewal error proves nothing, and completeReplayStep's startedAt fencing still protects against an actual lost claim, so aborting here would only turn a transient blip into a needless false failure.
          this.logger.error(
            `Replay ${job.replayStepId}: failed to renew claim, will retry next tick`,
            error
          )
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
      costMicros: bigint
      costUnpriced: boolean
    }
    try {
      const result = await this.interpreter.executeNode(
        mergedNode,
        originalStep.input,
        execution.workspaceId,
        job.replayStepId,
        abortController.signal
      )
      const isAiCall =
        mergedNode.type === "ai" &&
        result.tokensInput !== undefined &&
        result.tokensOutput !== undefined
      const costMicros = isAiCall
        ? calculateCostMicros(
            mergedNode.config.model as string,
            result.tokensInput as number,
            result.tokensOutput as number
          )
        : undefined
      if (isAiCall && costMicros === undefined) {
        this.logger.warn(
          `Replay ${job.replayStepId}: costMicros 0 is unpriced, not free — model has no verified rate`
        )
      }
      outcome = {
        status: "succeeded",
        output: result.output as Record<string, unknown>,
        tokensInput: result.tokensInput ?? 0,
        tokensOutput: result.tokensOutput ?? 0,
        costMicros: costMicros ?? 0n,
        costUnpriced: isAiCall && costMicros === undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined
      outcome = {
        status: "failed",
        error: { message, stack },
        tokensInput: 0,
        tokensOutput: 0,
        costMicros: 0n,
        costUnpriced: false,
      }
    } finally {
      // clearInterval stops new ticks, but one already in flight may not have updated claimToken yet — wait for it so completion reads the token that matches the DB.
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
        costMicros: outcome.costMicros,
        tokensInput: outcome.tokensInput,
        tokensOutput: outcome.tokensOutput,
        attributes: outcome.costUnpriced ? { costUnpriced: true } : undefined,
      }
    )
  }
}
