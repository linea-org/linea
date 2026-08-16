import { randomUUID } from "node:crypto"
import { Injectable, Logger } from "@nestjs/common"
import { db, repositories, type Execution } from "@linea/db"
import { validateGraphStructure, workflowGraphSchema } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import {
  InterpreterService,
  type RunOutcome,
} from "../graph/interpreter.service"
import { RunLeaseService } from "./run-lease.service"

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name)
  // Just a log prefix — RunsService is a singleton, so the actual fencing token is generated fresh per call below, not stored on the instance.
  private readonly processId = `execution-worker:${process.pid}`

  constructor(
    private readonly checkpoints: CheckpointsService,
    private readonly interpreter: InterpreterService,
    private readonly lease: RunLeaseService
  ) {}

  async execute(executionId: string): Promise<void> {
    const attemptId = `${this.processId}:${randomUUID()}`

    const execution = await repositories.execution.startExecution(
      db,
      executionId,
      attemptId,
      this.lease.computeLeaseExpiry()
    )

    if (!execution) {
      this.logger.warn(
        `Execution ${executionId} was not claimable (already running or terminal) — skipping`
      )
      return
    }

    // Aborts whatever node handler call is in flight the moment the lease is lost, instead of letting a duplicate HTTP mutation or billed AI completion run in parallel with whoever reclaimed the lease.
    const abortController = new AbortController()
    this.lease.startHeartbeat(executionId, attemptId, () =>
      abortController.abort()
    )

    // Best totals known so far, so a failure partway through still reports checkpointed usage instead of zero.
    let knownTokensInput = 0
    let knownTokensOutput = 0
    let knownCostMicros = 0n
    let knownCostUnpriced: boolean | null = false

    try {
      // Loaded first, before anything that can throw for unrelated reasons (a bad version id, a corrupt graph) — otherwise a reclaimed execution with real prior usage would finalize at zero on those failures too.
      const resumeTokens =
        await this.checkpoints.getResumeTokenTotals(executionId)
      knownTokensInput = resumeTokens.tokensInput
      knownTokensOutput = resumeTokens.tokensOutput
      knownCostMicros = resumeTokens.costMicros
      knownCostUnpriced = resumeTokens.costUnpriced

      const version = await repositories.workflow.getWorkflowVersionById(
        db,
        execution.workflowVersionId
      )
      if (!version) {
        throw new Error(
          `Workflow version ${execution.workflowVersionId} not found`
        )
      }

      const graph = workflowGraphSchema.parse(version.graph)
      validateGraphStructure(graph)

      const resumeFrom = await this.checkpoints.getResumeState(executionId)
      if (resumeFrom.size > 0) {
        await this.checkpoints.recordResumeEvent(
          executionId,
          execution.workspaceId,
          attemptId
        )
      }

      // An approval node never checkpoints before throwing PauseExecutionError (there's no
      // output to record yet), so re-running from the same resumeFrom just re-enters it. That
      // makes this loop safe as the fix for a real race: the approval node creates its row and
      // notifies before this execution is ever marked "paused" below, so a fast enough response
      // can find nothing to flip back from "paused" to "queued" and land permanently stuck. If
      // the approval is already resolved by the time we're about to pause, skip pausing and
      // loop back immediately — the node returns its real output instead of pausing again.
      let outcome: RunOutcome
      for (;;) {
        outcome = await this.interpreter.run({
          executionId,
          workspaceId: execution.workspaceId,
          leasedBy: attemptId,
          graph,
          triggerPayload: execution.triggerPayload,
          resumeFrom,
          initialTokensInput: resumeTokens.tokensInput,
          initialTokensOutput: resumeTokens.tokensOutput,
          initialCostMicros: resumeTokens.costMicros,
          initialCostUnpriced: resumeTokens.costUnpriced,
          signal: abortController.signal,
        })
        if (!outcome.pausedAt) break
        const approval = await repositories.approval.getApproval(
          db,
          execution.workspaceId,
          executionId,
          outcome.pausedAt
        )
        if (!approval || approval.status === "pending") break
      }
      knownTokensInput = outcome.totalTokensInput
      knownTokensOutput = outcome.totalTokensOutput
      knownCostMicros = outcome.totalCostMicros
      knownCostUnpriced = outcome.costUnpriced

      if (outcome.costUnpriced === true) {
        this.logger.warn(
          `Execution ${executionId}: costMicros ${outcome.totalCostMicros} is a partial total — at least one step used a model with no verified price`
        )
      } else if (outcome.costUnpriced === null) {
        this.logger.warn(
          `Execution ${executionId}: costMicros ${outcome.totalCostMicros} has unknown completeness — a resumed step predates cost tracking`
        )
      }

      if (outcome.pausedAt) {
        await repositories.execution.pauseExecution(db, executionId, attemptId)
        return
      }

      // Only absent when pausedAt is set, handled above — safe to assert defined here.
      const result = outcome.result!

      if (result.status === "completed") {
        await repositories.execution.completeExecution(
          db,
          executionId,
          attemptId,
          {
            status: "succeeded",
            costMicros: outcome.totalCostMicros,
            costUnpriced: outcome.costUnpriced,
            tokensInput: outcome.totalTokensInput,
            tokensOutput: outcome.totalTokensOutput,
          }
        )
      } else {
        const failed = await repositories.execution.completeExecution(
          db,
          executionId,
          attemptId,
          {
            status: "failed",
            error: {
              message: result.error,
              stepId: result.nodeId,
            },
            costMicros: outcome.totalCostMicros,
            costUnpriced: outcome.costUnpriced,
            tokensInput: outcome.totalTokensInput,
            tokensOutput: outcome.totalTokensOutput,
          }
        )
        if (failed) await this.notifyExecutionFailed(failed, result.error)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // known* can be stale here — interpreter.run() only returns totals at the end, so re-read.
      const latestKnown = await this.checkpoints
        .getResumeTokenTotals(executionId)
        .catch(() => ({
          tokensInput: knownTokensInput,
          tokensOutput: knownTokensOutput,
          costMicros: knownCostMicros,
          costUnpriced: knownCostUnpriced,
        }))
      const failed = await repositories.execution.completeExecution(
        db,
        executionId,
        attemptId,
        {
          status: "failed",
          error: { message },
          costMicros: latestKnown.costMicros,
          costUnpriced: latestKnown.costUnpriced,
          tokensInput: latestKnown.tokensInput,
          tokensOutput: latestKnown.tokensOutput,
        }
      )
      if (failed) await this.notifyExecutionFailed(failed, message)
      throw error
    } finally {
      this.lease.stopHeartbeat(attemptId)
    }
  }

  /** Best-effort: a notification failure shouldn't fail the execution itself, which has already been finalized by the time this runs. Only called when completeExecution actually won the transition — a worker that lost the lease race stays silent so the winner's own call is the only one that notifies. */
  private async notifyExecutionFailed(
    execution: Execution,
    errorMessage: string
  ): Promise<void> {
    try {
      const [workflow, memberUserIds] = await Promise.all([
        repositories.workflow.getWorkflowById(
          db,
          execution.workspaceId,
          execution.workflowId
        ),
        repositories.organization.listMemberUserIds(db, execution.workspaceId),
      ])
      await repositories.notification.createNotificationsForUsers(
        db,
        memberUserIds,
        {
          workspaceId: execution.workspaceId,
          type: "execution.failed",
          severity: "error",
          title: `${workflow?.name ?? "Workflow"} run failed`,
          body: errorMessage,
          metadata: {
            workflowId: execution.workflowId,
            executionId: execution.id,
            workspaceId: execution.workspaceId,
          },
        }
      )
    } catch (notifyError) {
      const message =
        notifyError instanceof Error ? notifyError.message : String(notifyError)
      this.logger.warn(
        `Failed to create execution-failed notification for execution ${execution.id}: ${message}`
      )
    }
  }
}
