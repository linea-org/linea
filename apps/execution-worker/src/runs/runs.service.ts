import { randomUUID } from "node:crypto"
import { Injectable, Logger } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import {
  validateGraphStructure,
  workflowGraphSchema,
  type WorkflowGraph,
} from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "../graph/interpreter.service"
import { RunLeaseService } from "./run-lease.service"

function extractConversationId(triggerPayload: unknown): string | undefined {
  if (triggerPayload === null || typeof triggerPayload !== "object") {
    return undefined
  }
  const value = (triggerPayload as Record<string, unknown>).conversationId
  return typeof value === "string" ? value : undefined
}

function extractChatMessageId(triggerPayload: unknown): string | undefined {
  if (triggerPayload === null || typeof triggerPayload !== "object") {
    return undefined
  }
  const value = (triggerPayload as Record<string, unknown>).chatMessageId
  return typeof value === "string" ? value : undefined
}

/** The most recently completed `ai` node's output — walked from the end, since a graph can have more than one and the chat reply is whichever one ran last. Checks the node's actual type, not just the shape of its output, since a transform/http node's output could coincidentally also carry a `text` field. */
function extractAssistantReply(
  completed: Map<string, unknown>,
  graph: WorkflowGraph
): string | undefined {
  const aiNodeIds = new Set(
    graph.nodes.filter((node) => node.type === "ai").map((node) => node.id)
  )
  const entries = [...completed.entries()]
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const [nodeId, value] = entries[i]
    if (!aiNodeIds.has(nodeId)) continue
    if (
      value !== null &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).text === "string"
    ) {
      return (value as { text: string }).text
    }
  }
  return undefined
}

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
        workflowId: execution.workflowId,
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

        // Best-effort: a chat-preview turn's reply persisted for the panel to redisplay. Never allowed to fail the execution it rides on.
        const conversationId = extractConversationId(execution.triggerPayload)
        if (conversationId) {
          const reply = extractAssistantReply(outcome.completed, graph)
          const chatMessageId = extractChatMessageId(execution.triggerPayload)
          // triggerPayload is caller-supplied and unvalidated, so only persist a reply once chatMessageId resolves to a real user turn in this scope.
          const respondsTo =
            reply && chatMessageId
              ? await repositories.chatMessage.getUserChatMessageById(
                  db,
                  execution.workspaceId,
                  execution.workflowId,
                  conversationId,
                  chatMessageId
                )
              : undefined
          if (reply && respondsTo) {
            await repositories.chatMessage
              .createChatMessage(db, {
                workspaceId: execution.workspaceId,
                workflowId: execution.workflowId,
                conversationId,
                executionId,
                role: "assistant",
                content: reply,
                respondsToMessageId: respondsTo.id,
              })
              .catch((error: unknown) => {
                const message =
                  error instanceof Error ? error.message : String(error)
                this.logger.warn(
                  `Execution ${executionId}: failed to persist assistant chat message — ${message}`
                )
              })
          }
        }
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
      // known* can be stale here — interpreter.run() only returns totals at the end, so re-read.
      const latestKnown = await this.checkpoints
        .getResumeTokenTotals(executionId)
        .catch(() => ({
          tokensInput: knownTokensInput,
          tokensOutput: knownTokensOutput,
          costMicros: knownCostMicros,
          costUnpriced: knownCostUnpriced,
        }))
      await repositories.execution.completeExecution(
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
      throw error
    } finally {
      this.lease.stopHeartbeat(attemptId)
    }
  }
}
