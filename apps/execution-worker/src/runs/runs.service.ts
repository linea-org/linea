import { randomUUID } from "node:crypto"
import { Injectable, Logger } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { validateGraphStructure, workflowGraphSchema } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "../graph/interpreter.service"
import { RunLeaseService } from "./run-lease.service"

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name)
  private readonly workerId = `execution-worker:${process.pid}:${randomUUID()}`

  constructor(
    private readonly checkpoints: CheckpointsService,
    private readonly interpreter: InterpreterService,
    private readonly lease: RunLeaseService
  ) {}

  async execute(executionId: string): Promise<void> {
    const execution = await repositories.execution.startExecution(
      db,
      executionId,
      this.workerId,
      this.lease.computeLeaseExpiry()
    )

    if (!execution) {
      this.logger.warn(
        `Execution ${executionId} was not claimable (already running or terminal) — skipping`
      )
      return
    }

    this.lease.startHeartbeat(executionId, this.workerId)

    // Tracks the best token totals known so far, so a failure partway through
    // (validation, walking, or a lease lost mid-step) still reports usage
    // already durably checkpointed, instead of always finalizing at zero.
    let knownTokensInput = 0
    let knownTokensOutput = 0

    try {
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
      const resumeTokens =
        await this.checkpoints.getResumeTokenTotals(executionId)
      knownTokensInput = resumeTokens.tokensInput
      knownTokensOutput = resumeTokens.tokensOutput

      const outcome = await this.interpreter.run({
        executionId,
        workspaceId: execution.workspaceId,
        leasedBy: this.workerId,
        graph,
        triggerPayload: execution.triggerPayload,
        resumeFrom,
        initialTokensInput: resumeTokens.tokensInput,
        initialTokensOutput: resumeTokens.tokensOutput,
      })
      knownTokensInput = outcome.totalTokensInput
      knownTokensOutput = outcome.totalTokensOutput

      // No per-token pricing table exists anywhere yet — tracked as a known
      // gap (see MODULE.md), not silently invented. Tokens are still real.
      if (outcome.result.status === "completed") {
        await repositories.execution.completeExecution(
          db,
          executionId,
          this.workerId,
          {
            status: "succeeded",
            costMicros: 0n,
            tokensInput: outcome.totalTokensInput,
            tokensOutput: outcome.totalTokensOutput,
          }
        )
      } else {
        await repositories.execution.completeExecution(
          db,
          executionId,
          this.workerId,
          {
            status: "failed",
            error: {
              message: outcome.result.error,
              stepId: outcome.result.nodeId,
            },
            costMicros: 0n,
            tokensInput: outcome.totalTokensInput,
            tokensOutput: outcome.totalTokensOutput,
          }
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.completeExecution(
        db,
        executionId,
        this.workerId,
        {
          status: "failed",
          error: { message },
          costMicros: 0n,
          tokensInput: knownTokensInput,
          tokensOutput: knownTokensOutput,
        }
      )
      throw error
    } finally {
      this.lease.stopHeartbeat(executionId)
    }
  }
}
