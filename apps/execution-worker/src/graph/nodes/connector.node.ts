import { Injectable } from "@nestjs/common"
import { connectorRequestSchema, nodeRegistry } from "@linea/runtime"
import { PauseExecutionError } from "../../checkpoints/checkpoints.service"
import { ConnectorGatewayService } from "../../connectors/connector-gateway.service"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"
import { NonRetryableError } from "./non-retryable-error"

@Injectable()
export class ConnectorNode implements NodeHandler {
  constructor(
    private readonly gateway: ConnectorGatewayService = new ConnectorGatewayService()
  ) {}

  async execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const { executionId, nodeId, idempotencyKey, leasedBy } = context
    if (!executionId || !nodeId || !idempotencyKey || !leasedBy) {
      throw new Error("Connector node requires an invocation identity")
    }
    const connectorConfig = nodeRegistry.connector.inputSchema.parse(config)
    const request = connectorRequestSchema.parse(input)
    let result: Awaited<ReturnType<ConnectorGatewayService["execute"]>>
    try {
      result = await this.gateway.execute({
        executionId,
        workspaceId: context.workspaceId,
        nodeId,
        connectionId: request.connectionId,
        operationId: connectorConfig.operation,
        operationInput: request.input,
        invocationIdempotencyKey: idempotencyKey,
        executionClaimId: leasedBy,
        signal: context.signal,
      })
    } catch (error) {
      throw new NonRetryableError(
        error instanceof Error ? error.message : "Connector operation failed",
        { cause: error }
      )
    }
    if (result.outcome === "awaiting_consent") {
      throw new PauseExecutionError(nodeId)
    }
    if (result.outcome === "rejected") {
      return {
        status: "rejected",
        actionIntentId: result.actionIntentId,
        reason: result.reason,
      }
    }
    return result.result
  }
}
