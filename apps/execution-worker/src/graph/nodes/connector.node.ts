import { Injectable } from "@nestjs/common"
import { connectorRequestSchema, nodeRegistry } from "@linea/runtime"
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

  execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    if (!context.executionId) {
      throw new Error("Connector node requires an Execution")
    }
    const connectorConfig = nodeRegistry.connector.inputSchema.parse(config)
    const request = connectorRequestSchema.parse(input)
    return this.gateway.executeRead({
      executionId: context.executionId,
      workspaceId: context.workspaceId,
      connectionId: request.connectionId,
      operationId: connectorConfig.operation,
      operationInput: request.input,
      signal: context.signal,
    })
  }
}
