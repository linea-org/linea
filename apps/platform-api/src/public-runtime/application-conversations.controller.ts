import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  createApplicationConversationSchema,
  publicRuntimeIdSchema,
  type CreateApplicationConversation,
} from '@linea/protocol/resources'
import {
  paginationQuerySchema,
  type PaginationQuery,
} from '@linea/protocol/shared'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { CurrentApplicationPrincipal } from '../auth/current-application-principal.decorator'
import { RequireApplicationScopes } from '../auth/require-application-scopes.decorator'
import { IdempotencyKey } from './idempotency-key.decorator'
import { PublicValidationPipe } from './public-validation.pipe'
import { PublicRuntimeService } from './public-runtime.service'

@Controller('applications/:applicationId/conversations')
@OptionalAuth()
@UseGuards(ApplicationKeyGuard, ApplicationScopeGuard)
export class ApplicationConversationsController {
  constructor(private readonly runtime: PublicRuntimeService) {}

  @Post()
  @RequireApplicationScopes('conversations:write')
  create(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new PublicValidationPipe(createApplicationConversationSchema))
    body: CreateApplicationConversation,
  ) {
    return this.runtime.createApplicationConversation(
      principal,
      body,
      idempotencyKey,
    )
  }

  @Get()
  @RequireApplicationScopes('conversations:read')
  list(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.runtime.listApplicationConversations(principal, query)
  }

  @Get(':conversationId')
  @RequireApplicationScopes('conversations:read')
  get(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @Param('conversationId', new PublicValidationPipe(publicRuntimeIdSchema))
    conversationId: string,
  ) {
    return this.runtime.getApplicationConversation(principal, conversationId)
  }
}
