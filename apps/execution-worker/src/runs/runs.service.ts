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

      const outcome = await this.interpreter.run({
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

      if (outcome.result.status === "completed") {
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
        await repositories.execution.completeExecution(
          db,
          executionId,
          attemptId,
          {
            status: "failed",
            error: {
              message: outcome.result.error,
              stepId: outcome.result.nodeId,
            },
            costMicros: outcome.totalCostMicros,
            costUnpriced: outcome.costUnpriced,
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
        attemptId,
        {
          status: "failed",
          error: { message },
          costMicros: knownCostMicros,
          costUnpriced: knownCostUnpriced,
          tokensInput: knownTokensInput,
          tokensOutput: knownTokensOutput,
        }
      )
      throw error
    } finally {
      this.lease.stopHeartbeat(attemptId)
    }
  }
}
