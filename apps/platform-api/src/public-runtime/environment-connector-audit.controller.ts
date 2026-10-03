import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  paginationQuerySchema,
  type PaginationQuery,
} from '@linea/protocol/shared'
import type { EnvironmentPrincipal } from '../auth/environment-key.guard'
import { EnvironmentKeyGuard } from '../auth/environment-key.guard'
import { EnvironmentScopeGuard } from '../auth/environment-scope.guard'
import { CurrentEnvironmentPrincipal } from '../auth/current-environment-principal.decorator'
import { RequireEnvironmentScopes } from '../auth/require-environment-scopes.decorator'
import { ConnectorAuditService } from './connector-audit.service'
import { PublicValidationPipe } from './public-validation.pipe'

@Controller('environments/:environmentId/audit-events')
@OptionalAuth()
@UseGuards(EnvironmentKeyGuard, EnvironmentScopeGuard)
export class EnvironmentConnectorAuditController {
  constructor(private readonly audit: ConnectorAuditService) {}

  @Get()
  @RequireEnvironmentScopes('audit:read')
  list(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.audit.listEnvironment(principal, query)
  }
}
