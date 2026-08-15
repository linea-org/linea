import { Injectable } from "@nestjs/common"
import { calculateCostMicros } from "@linea/ai"
import { walk } from "@linea/runtime"
import type {
  StepResult,
  WalkResult,
  WorkflowGraph,
  WorkflowNode,
} from "@linea/runtime"
import {
  CheckpointsService,
  LeaseLostError,
  PauseExecutionError,
} from "../checkpoints/checkpoints.service"
import { AiNode } from "./nodes/ai.node"
import { ApprovalNode } from "./nodes/approval.node"
import { BranchNode } from "./nodes/branch.node"
import { EndNode } from "./nodes/end.node"
import { HttpNode } from "./nodes/http.node"
import type { NodeHandler } from "./nodes/node-handler.interface"
import { StartNode } from "./nodes/start.node"
import { TransformNode } from "./nodes/transform.node"

export type RunInput = {
  executionId: string
  workspaceId: string
  leasedBy: string
  graph: WorkflowGraph
  triggerPayload: unknown
  resumeFrom: Map<string, unknown>
  // Usage already recorded for steps in `resumeFrom`, since they're skipped rather than re-executed.
  initialTokensInput?: number
  initialTokensOutput?: number
  initialCostMicros?: bigint
  initialCostUnpriced?: boolean | null
  // Aborted by the caller (RunsService) when the execution lease is lost mid-step, so the in-flight node handler's own request is cancelled instead of just racing the checkpoint.
  signal?: AbortSignal
}

export type RunOutcome = {
  // Absent (undefined) `result` only when `pausedAt` is set — the walk was abandoned mid-node, not completed or failed.
  result?: WalkResult
  // Set when a node handler threw PauseExecutionError — the run stopped short pending external input, distinct from completing or failing.
  pausedAt?: string
  totalTokensInput: number
  totalTokensOutput: number
  totalCostMicros: bigint
  // true: some step unpriced. null: some step predates tracking. false: all priced.
  costUnpriced: boolean | null
}

/** true beats null beats false. */
function mergeCostUnpriced(
  a: boolean | null,
  b: boolean | null
): boolean | null {
  if (a === true || b === true) return true
  if (a === null || b === null) return null
  return false
}

function extractTokenUsage(
  output: unknown
): { tokensInput: number; tokensOutput: number } | undefined {
  if (
    output !== null &&
    typeof output === "object" &&
    typeof (output as Record<string, unknown>).tokensInput === "number" &&
    typeof (output as Record<string, unknown>).tokensOutput === "number"
  ) {
    const usage = output as { tokensInput: number; tokensOutput: number }
    return { tokensInput: usage.tokensInput, tokensOutput: usage.tokensOutput }
  }
  return undefined
}

@Injectable()
export class InterpreterService {
  private readonly handlers: Record<string, NodeHandler>

  constructor(
    private readonly checkpoints: CheckpointsService,
    httpNode: HttpNode,
    transformNode: TransformNode,
    branchNode: BranchNode,
    aiNode: AiNode,
    approvalNode: ApprovalNode
  ) {
    this.handlers = {
      http: httpNode,
      transform: transformNode,
      branch: branchNode,
      ai: aiNode,
      approval: approvalNode,
      start: new StartNode(),
      end: new EndNode(),
    }
  }

  /** The reusable "run one node" unit, independent of the walker/checkpoints/leases — `run()` uses it per graph step, and step-level replay (apps/execution-worker/src/replay) calls it directly for one node with a substituted config, bypassing the walker since a replay target's input is already known. */
  async executeNode(
    node: WorkflowNode,
    input: unknown,
    workspaceId: string,
    idempotencyKey?: string,
    signal?: AbortSignal,
    executionId?: string
  ): Promise<{
    output: unknown
    tokensInput?: number
    tokensOutput?: number
  }> {
    const handler = this.handlers[node.type]
    if (!handler) {
      throw new Error(`No handler for node type "${node.type}"`)
    }
    const output = await handler.execute(node.config, input, {
      workspaceId,
      idempotencyKey,
      signal,
      executionId,
      nodeId: node.id,
    })
    const usage = extractTokenUsage(output)
    return {
      output,
      tokensInput: usage?.tokensInput,
      tokensOutput: usage?.tokensOutput,
    }
  }

  async run(input: RunInput): Promise<RunOutcome> {
    const generator = walk(input.graph, {
      completed: input.resumeFrom,
      triggerPayload: input.triggerPayload,
    })
    const completed = new Map(input.resumeFrom)
    let totalTokensInput = input.initialTokensInput ?? 0
    let totalTokensOutput = input.initialTokensOutput ?? 0
    let totalCostMicros = input.initialCostMicros ?? 0n
    // ?? would collapse an explicit null (unknown) into false — only a truly absent field defaults.
    let costUnpriced: boolean | null =
      input.initialCostUnpriced === undefined
        ? false
        : input.initialCostUnpriced

    let next = generator.next()
    while (!next.done) {
      const step = next.value
      const node = input.graph.nodes.find((n) => n.id === step.nodeId)
      if (!node) {
        throw new Error(`Node "${step.nodeId}" not found in graph`)
      }

      const startedAt = new Date()
      let stepResult: StepResult

      try {
        // A worker that already lost the lease shouldn't start a new HTTP/AI call at all.
        await this.checkpoints.assertOwnsLease(
          input.executionId,
          input.leasedBy
        )

        const { output, tokensInput, tokensOutput } = await this.executeNode(
          node,
          step.input,
          input.workspaceId,
          `${input.executionId}:${step.nodeId}`,
          input.signal,
          input.executionId
        )
        let costMicros: bigint | undefined
        let stepCostUnpriced: boolean | undefined
        if (tokensInput !== undefined && tokensOutput !== undefined) {
          totalTokensInput += tokensInput
          totalTokensOutput += tokensOutput
          if (node.type === "ai") {
            costMicros = calculateCostMicros(
              node.config.model as string,
              tokensInput,
              tokensOutput
            )
            stepCostUnpriced = costMicros === undefined
            if (costMicros !== undefined) {
              totalCostMicros += costMicros
            }
            costUnpriced = mergeCostUnpriced(costUnpriced, stepCostUnpriced)
          }
        }

        // Update before checkpointing, so a crash right after the write doesn't leave a resume replaying this step.
        completed.set(step.nodeId, output)

        await this.checkpoints.recordStep({
          executionId: input.executionId,
          workspaceId: input.workspaceId,
          leasedBy: input.leasedBy,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          input: step.input,
          output,
          startedAt,
          endedAt: new Date(),
          tokensInput,
          tokensOutput,
          costMicros,
          costUnpriced: stepCostUnpriced,
          completed,
        })

        stepResult = { nodeId: step.nodeId, output }
      } catch (error) {
        // A failure-checkpoint write would be rejected too — propagate instead of attempting it.
        if (error instanceof LeaseLostError) {
          throw error
        }
        // input.signal is only aborted by RunsService on lease loss, so an abort here is a lease loss discovered mid-call, not a genuine node failure — same handling as the up-front assertOwnsLease check.
        if (input.signal?.aborted) {
          throw new LeaseLostError(input.executionId)
        }
        // No checkpoint write here: this node never produced output, so `completed` (and the latest checkpoint) already reflect every prior successful node — exactly the state a later resume should restart from.
        if (error instanceof PauseExecutionError) {
          return {
            pausedAt: error.nodeId,
            totalTokensInput,
            totalTokensOutput,
            totalCostMicros,
            costUnpriced,
          }
        }

        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack : undefined

        await this.checkpoints.recordStep({
          executionId: input.executionId,
          workspaceId: input.workspaceId,
          leasedBy: input.leasedBy,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          input: step.input,
          error: { message, stack },
          startedAt,
          endedAt: new Date(),
          completed,
        })

        stepResult = { nodeId: step.nodeId, error: { message } }
      }

      next = generator.next(stepResult)
    }

    return {
      result: next.value,
      totalTokensInput,
      totalTokensOutput,
      totalCostMicros,
      costUnpriced,
    }
  }
}
