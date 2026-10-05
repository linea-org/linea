import {
  listEnvironmentConnectionsOperation,
  createGithubInstallationConnectionOperation,
  getConnectionAuthoritiesOperation,
  grantConnectionAccessOperation,
  revokeConnectionAccessOperation,
  assignConnectionReviewerOperation,
  revokeConnectionReviewerOperation,
  revokeSharedConnectionOperation,
  listWorkspaceConnectorAuditEventsOperation,
} from "@linea/protocol/operations"
import type {
  Connection,
  ConnectionAuthorities,
  ConnectionAuthorityRecord,
  CreateGithubInstallationConnection,
  OperatorConnectorAuditEvent,
} from "@linea/protocol/resources"
import type { PaginatedResponse, PaginationQuery } from "@linea/protocol/shared"
import { ServerTransport } from "./transport.js"
export type LineaConnectionAdminClientOptions = {
  environmentId: string
  sessionCookie: string
  baseUrl?: string
}
export class LineaConnectionAdminClient {
  private readonly environmentId: string
  private readonly transport: ServerTransport
  constructor(options: LineaConnectionAdminClientOptions) {
    this.environmentId = options.environmentId
    this.transport = new ServerTransport(
      options.baseUrl ?? "http://localhost:3000",
      { sessionCookie: options.sessionCookie }
    )
  }
  listConnections(): Promise<Connection[]> {
    return this.transport.execute(listEnvironmentConnectionsOperation, {
      path: { environmentId: this.environmentId },
    })
  }
  createGithubInstallation(
    input: CreateGithubInstallationConnection
  ): Promise<Connection> {
    return this.transport.execute(createGithubInstallationConnectionOperation, {
      path: { environmentId: this.environmentId },
      body: input,
    })
  }
  getAuthorities(connectionId: string): Promise<ConnectionAuthorities> {
    return this.transport.execute(getConnectionAuthoritiesOperation, {
      path: { environmentId: this.environmentId, connectionId },
    })
  }
  grantAccess(
    connectionId: string,
    externalSubjectId: string
  ): Promise<ConnectionAuthorityRecord> {
    return this.transport.execute(grantConnectionAccessOperation, {
      path: { environmentId: this.environmentId, connectionId },
      body: { externalSubjectId },
    })
  }
  assignReviewer(
    connectionId: string,
    externalSubjectId: string
  ): Promise<ConnectionAuthorityRecord> {
    return this.transport.execute(assignConnectionReviewerOperation, {
      path: { environmentId: this.environmentId, connectionId },
      body: { externalSubjectId },
    })
  }
  revokeAccess(
    connectionId: string,
    authorizationId: string
  ): Promise<ConnectionAuthorityRecord> {
    return this.transport.execute(revokeConnectionAccessOperation, {
      path: {
        environmentId: this.environmentId,
        connectionId,
        authorizationId,
      },
    })
  }
  revokeReviewer(
    connectionId: string,
    authorizationId: string
  ): Promise<ConnectionAuthorityRecord> {
    return this.transport.execute(revokeConnectionReviewerOperation, {
      path: {
        environmentId: this.environmentId,
        connectionId,
        authorizationId,
      },
    })
  }
  revokeConnection(connectionId: string): Promise<Connection> {
    return this.transport.execute(revokeSharedConnectionOperation, {
      path: { environmentId: this.environmentId, connectionId },
    })
  }
  listAuditEvents(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<OperatorConnectorAuditEvent>> {
    return this.transport.execute(listWorkspaceConnectorAuditEventsOperation, {
      query: { ...query, environmentId: this.environmentId },
    })
  }
}
