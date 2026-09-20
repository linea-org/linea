import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  paginationQuerySchema,
  type PaginationQuery,
} from '@linea/protocol/shared'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { CurrentApplicationPrincipal } from '../auth/current-application-principal.decorator'
import { RequireApplicationScopes } from '../auth/require-application-scopes.decorator'
import { ConnectorAuditService } from './connector-audit.service'
import { PublicValidationPipe } from './public-validation.pipe'

@Controller('applications/:applicationId/audit-events')
@OptionalAuth()
@UseGuards(ApplicationKeyGuard, ApplicationScopeGuard)
export class ApplicationConnectorAuditController {
  constructor(private readonly audit: ConnectorAuditService) {}

  @Get()
  @RequireApplicationScopes('audit:read')
  list(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.audit.listApplication(principal, query)
  }
}
