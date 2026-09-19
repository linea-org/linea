import { Injectable } from "@nestjs/common"
import { connectorRequestSchema, nodeRegistry } from "@linea/runtime"
import { PauseExecutionError } from "../../checkpoints/checkpoints.service"
import { ConnectorGatewayService } from "../../connectors/connector-gateway.service"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

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
    const { executionId, nodeId, idempotencyKey } = context
    if (!executionId || !nodeId || !idempotencyKey) {
      throw new Error("Connector node requires an invocation identity")
    }
    const connectorConfig = nodeRegistry.connector.inputSchema.parse(config)
    const request = connectorRequestSchema.parse(input)
    const result = await this.gateway.execute({
      executionId,
      workspaceId: context.workspaceId,
      nodeId,
      connectionId: request.connectionId,
      operationId: connectorConfig.operation,
      operationInput: request.input,
      invocationIdempotencyKey: idempotencyKey,
      signal: context.signal,
    })
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
