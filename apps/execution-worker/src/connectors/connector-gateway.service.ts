import { Injectable } from "@nestjs/common"
import { ConnectorGateway, connectorOperationRegistry } from "@linea/connectors"
import { db } from "@linea/db"

@Injectable()
export class ConnectorGatewayService {
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
