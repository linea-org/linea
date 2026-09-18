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
import { PublicValidationPipe } from './public-validation.pipe'
import { WebhookDeliveriesService } from './webhook-deliveries.service'

@Controller('applications/:applicationId/webhook-deliveries')
@OptionalAuth()
@UseGuards(ApplicationKeyGuard, ApplicationScopeGuard)
export class WebhookDeliveriesController {
  constructor(private readonly deliveries: WebhookDeliveriesService) {}

  @Get()
  @RequireApplicationScopes('webhooks:read')
  list(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.deliveries.list(principal, query)
  }
}
