import { Injectable } from "@nestjs/common"
import { agentRequestSchema, nodeRegistry } from "@linea/runtime"
import { db, repositories, type Execution } from "@linea/db"
import { PauseExecutionError } from "../../checkpoints/checkpoints.service"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"
import { NonRetryableError } from "./non-retryable-error"

@Injectable()
export class AgentNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const { executionId, nodeId } = context
    if (!executionId || !nodeId)
      throw new Error("Agent node requires an invocation identity")
    const { agentId, agentContractRevisionId } =
      nodeRegistry.agent.inputSchema.parse(config)
    const request = agentRequestSchema.safeParse(input)
    if (!request.success)
      throw new NonRetryableError("The Agent step input must be an object")
    const started =
      await repositories.nestedAgentExecution.startNestedAgentExecution(db, {
        workspaceId: context.workspaceId,
        parentExecutionId: executionId,
        nodeId,
        agentId,
        agentContractRevisionId,
        input: request.data,
      })
    if (started.outcome === "created" || started.outcome === "existing")
      return this.outcomeOf(started.execution, nodeId)
    throw new NonRetryableError(started.message)
  }

  private outcomeOf(child: Execution, nodeId: string): unknown {
    switch (child.status) {
      case "succeeded":
        return child.output
      case "failed":
        throw new NonRetryableError(
          child.error?.message ?? "The Agent invocation failed"
        )
      case "cancelled":
        throw new NonRetryableError("The Agent invocation was cancelled")
      case "queued":
      case "running":
      case "paused":
        throw new PauseExecutionError(nodeId)
      default: {
        const unreachable: never = child.status
        return unreachable
      }
    }
  }
}
