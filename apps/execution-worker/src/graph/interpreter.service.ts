import { Injectable } from "@nestjs/common"
import { walk } from "@linea/runtime"
import type { StepResult, WalkResult, WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { AiNode } from "./nodes/ai.node"
import { BranchNode } from "./nodes/branch.node"
import { HttpNode } from "./nodes/http.node"
import type { NodeHandler } from "./nodes/node-handler.interface"
import { TransformNode } from "./nodes/transform.node"

export type RunInput = {
  executionId: string
  workspaceId: string
  leasedBy: string
  graph: WorkflowGraph
  triggerPayload: unknown
  resumeFrom: Map<string, unknown>
  // Token usage already recorded for steps in `resumeFrom` — they're skipped,
  // not re-executed, so their usage has to be seeded rather than re-accumulated.
  initialTokensInput?: number
  initialTokensOutput?: number
}

export type RunOutcome = {
  result: WalkResult
  totalTokensInput: number
  totalTokensOutput: number
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
    aiNode: AiNode
  ) {
    this.handlers = {
      http: httpNode,
      transform: transformNode,
      branch: branchNode,
      ai: aiNode,
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

    let next = generator.next()
    while (!next.done) {
      const step = next.value
      const node = input.graph.nodes.find((n) => n.id === step.nodeId)
      if (!node) {
        throw new Error(`Node "${step.nodeId}" not found in graph`)
      }
      const handler = this.handlers[step.nodeType]
      if (!handler) {
        throw new Error(`No handler for node type "${step.nodeType}"`)
      }

      const startedAt = new Date()
      let stepResult: StepResult

      try {
        const output = await handler.execute(node.config, step.input, {
          workspaceId: input.workspaceId,
        })
        const usage = extractTokenUsage(output)
        if (usage) {
          totalTokensInput += usage.tokensInput
          totalTokensOutput += usage.tokensOutput
        }

        // Update `completed` before checkpointing, so the checkpoint reflects
        // this step as done — otherwise a crash right after the write leaves
        // a resume replaying a step whose execution_step row already exists,
        // tripping the idempotency constraint.
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
          tokensInput: usage?.tokensInput,
          tokensOutput: usage?.tokensOutput,
          completed,
        })

        stepResult = { nodeId: step.nodeId, output }
      } catch (error) {
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
    }
  }
}
