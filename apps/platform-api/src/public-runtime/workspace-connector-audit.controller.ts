import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  workspaceConnectorAuditQuerySchema,
  type WorkspaceConnectorAuditQuery,
} from '@linea/protocol/resources'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ConnectorAuditService } from './connector-audit.service'
import { PublicValidationPipe } from './public-validation.pipe'

@Controller('audit-events')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class WorkspaceConnectorAuditController {
  constructor(private readonly audit: ConnectorAuditService) {}

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Query(new PublicValidationPipe(workspaceConnectorAuditQuerySchema))
    query: WorkspaceConnectorAuditQuery,
  ) {
    return this.audit.listWorkspace(workspaceId, query)
  }
}
