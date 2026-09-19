import { decryptCredential, repositories, type Database } from "@linea/db"
import { z } from "zod"
import {
  registeredReadOperation,
  type ConnectorOperationRegistry,
  type ConnectorReadCredential,
} from "./connector-read-operation.js"

const storedCredentialSchema = z
  .object({
    accountId: z.string().min(1),
    accessToken: z.string().min(1),
    expiresAt: z.string().datetime().nullable(),
  })
  .passthrough()

export class ConnectorGatewayError extends Error {
  constructor(message = "Connector read rejected") {
    super(message)
    this.name = "ConnectorGatewayError"
  }
}

export class ConnectorGateway {
  constructor(
    private readonly db: Database,
    private readonly operations: ConnectorOperationRegistry
  ) {}

  async executeRead(input: {
    executionId: string
    workspaceId: string
    connectionId: string
    operationId: string
    operationInput: unknown
    signal?: AbortSignal
  }): Promise<unknown> {
    const operation = registeredReadOperation(
      this.operations,
      input.operationId
    )
    if (!operation) throw new ConnectorGatewayError()
    const authority = await repositories.connection.getConnectorReadAuthority(
      this.db,
      {
        executionId: input.executionId,
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
      }
    )
    if (authority?.connection.status !== "active") {
      throw new ConnectorGatewayError()
    }
    if (
      authority.connection.provider !== operation.provider ||
      !authority.providerPolicy.actionFamilies.includes(
        operation.actionFamily
      ) ||
      operation.requiredScopes.some(
        (scope) => !authority.connection.scopes.includes(scope)
      ) ||
      operation.requiredScopes.some(
        (scope) => !authority.providerPolicy.maxScopes.includes(scope)
      )
    ) {
      throw new ConnectorGatewayError()
    }
    const credential = this.resolveCredential(authority.connection)
    if (credential.accountId !== authority.connection.providerAccountId) {
      throw new ConnectorGatewayError()
    }
    let validatedInput: unknown
    try {
      validatedInput = operation.inputSchema.parse(input.operationInput)
    } catch {
      throw new ConnectorGatewayError("Connector input is invalid")
    }
    try {
      const result = await operation.execute(
        validatedInput,
        credential,
        input.signal
      )
      return operation.outputSchema.parse(result)
    } catch {
      throw new ConnectorGatewayError(operation.providerErrorMessage)
    }
  }

  private resolveCredential(connection: {
    id: string
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    provider: string
    credentialEncrypted: string | null
  }): ConnectorReadCredential {
    if (!connection.credentialEncrypted) throw new ConnectorGatewayError()
    try {
      const credential = storedCredentialSchema.parse(
        JSON.parse(
          decryptCredential(connection.credentialEncrypted, {
            workspaceId: connection.workspaceId,
            applicationId: connection.applicationId,
            externalSubjectId: connection.externalSubjectId,
            recordId: connection.id,
            provider: connection.provider,
          })
        )
      )
      if (
        credential.expiresAt &&
        Date.parse(credential.expiresAt) <= Date.now()
      ) {
        throw new ConnectorGatewayError()
      }
      return credential
    } catch (error) {
      if (error instanceof ConnectorGatewayError) throw error
      throw new ConnectorGatewayError()
    }
  }
}
