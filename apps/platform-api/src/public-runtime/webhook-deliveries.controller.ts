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
import { PublicValidationPipe } from './public-validation.pipe'
import { WebhookDeliveriesService } from './webhook-deliveries.service'

@Controller('environments/:environmentId/webhook-deliveries')
@OptionalAuth()
@UseGuards(EnvironmentKeyGuard, EnvironmentScopeGuard)
export class WebhookDeliveriesController {
  constructor(private readonly deliveries: WebhookDeliveriesService) {}

  @Get()
  @RequireEnvironmentScopes('webhooks:read')
  list(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.deliveries.list(principal, query)
  }
}
