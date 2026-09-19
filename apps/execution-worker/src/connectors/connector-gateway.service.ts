import { Injectable } from "@nestjs/common"
import { ConnectorGateway, connectorOperationRegistry } from "@linea/connectors"
import { db } from "@linea/db"

@Injectable()
export class ConnectorGatewayService {
  execute(input: {
    executionId: string
    workspaceId: string
    nodeId: string
    connectionId: string
    operationId: string
    operationInput: unknown
    invocationIdempotencyKey: string
    executionClaimId: string
    signal?: AbortSignal
  }) {
    return new ConnectorGateway(db, connectorOperationRegistry).execute(input)
  }

  executeRead(input: {
    executionId: string
    workspaceId: string
    connectionId: string
    operationId: string
    operationInput: unknown
    signal?: AbortSignal
  }): Promise<unknown> {
    return new ConnectorGateway(db, connectorOperationRegistry).executeRead(
      input
    )
  }
}
