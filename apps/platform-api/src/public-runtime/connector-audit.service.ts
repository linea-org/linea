import { Injectable } from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { WorkspaceConnectorAuditQuery } from '@linea/protocol/resources'
import type { PaginationQuery } from '@linea/protocol/shared'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import type { EndUserPrincipal } from '../end-user-sessions/end-user-session.guard'
import {
  decodeConnectorAuditCursor,
  encodeConnectorAuditCursor,
} from './public-pagination'
import {
  endUserConnectorAuditProjection,
  operatorConnectorAuditProjection,
} from './connector-audit.projections'

@Injectable()
export class ConnectorAuditService {
  async listApplication(
    principal: ApplicationPrincipal,
    query: PaginationQuery,
  ) {
    return this.listOperator(
      principal.workspaceId,
      principal.applicationId,
      query,
    )
  }

  async listWorkspace(
    workspaceId: string,
    query: WorkspaceConnectorAuditQuery,
  ) {
    return this.listOperator(workspaceId, query.applicationId, query)
  }

  async listEndUser(principal: EndUserPrincipal, query: PaginationQuery) {
    const facts = await repositories.connectorAudit.listEndUserFacts(db, {
      workspaceId: principal.workspaceId,
      applicationId: principal.applicationId,
      externalSubjectId: principal.externalSubjectId,
      limit: query.limit + 1,
      cursor: decodeConnectorAuditCursor(query.cursor),
      now: new Date(),
    })
    const page = facts.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: page.map(endUserConnectorAuditProjection),
      nextCursor:
        facts.length > query.limit && last
          ? encodeConnectorAuditCursor(last)
          : null,
    }
  }

  private async listOperator(
    workspaceId: string,
    applicationId: string | undefined,
    query: PaginationQuery,
  ) {
    const facts = await repositories.connectorAudit.listOperatorFacts(db, {
      workspaceId,
      applicationId,
      limit: query.limit + 1,
      cursor: decodeConnectorAuditCursor(query.cursor),
      now: new Date(),
    })
    const page = facts.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: page.map(operatorConnectorAuditProjection),
      nextCursor:
        facts.length > query.limit && last
          ? encodeConnectorAuditCursor(last)
          : null,
    }
  }
}
