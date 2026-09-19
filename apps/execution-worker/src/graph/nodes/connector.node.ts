import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
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
    if (typeof config.operation !== "string" || !config.operation) {
      throw new Error("Connector node requires an operation")
    }
    const request = nodeRegistry.connector.inputSchema.parse(input)
    return this.gateway.executeRead({
      executionId: context.executionId,
      workspaceId: context.workspaceId,
      connectionId: request.connectionId,
      operationId: config.operation,
      operationInput: request.input,
      signal: context.signal,
    })
  }
}
