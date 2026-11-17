import { listWorkspaceConnectorAuditEventsOperation } from "@linealabs/protocol/operations"
import type {
  OperatorConnectorAuditEvent,
  WorkspaceConnectorAuditQuery,
} from "@linealabs/protocol/resources"
import type { PaginatedResponse } from "@linealabs/protocol/shared"
import type { ServerTransport } from "../server/transport.js"

export class AuditEvents {
  constructor(private readonly transport: ServerTransport) {}

  list(
    query: Partial<WorkspaceConnectorAuditQuery> = {}
  ): Promise<PaginatedResponse<OperatorConnectorAuditEvent>> {
    return this.transport.execute(listWorkspaceConnectorAuditEventsOperation, {
      path: {},
      query,
    })
  }
}
