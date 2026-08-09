import { Injectable, Logger } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { workflowGraphSchema } from "@linea/runtime"
import type { WorkflowStepReplayJob } from "@linea/queue"
import { InterpreterService } from "../graph/interpreter.service"

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

    const startedAt = new Date()
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
        execution.workspaceId
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
    }

    const sequence = await repositories.executionStep.getNextStepSequence(
      db,
      execution.id
    )

    await repositories.executionStep.insertReplayStep(db, {
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
      endedAt: new Date(),
      status: outcome.status,
      output: outcome.output,
      error: outcome.error,
      costMicros: 0n,
      tokensInput: outcome.tokensInput,
      tokensOutput: outcome.tokensOutput,
    })
  }
}
