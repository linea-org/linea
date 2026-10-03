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
  createEnvironmentConversationSchema,
  publicRuntimeIdSchema,
  type CreateEnvironmentConversation,
} from '@linea/protocol/resources'
import {
  paginationQuerySchema,
  type PaginationQuery,
} from '@linea/protocol/shared'
import type { EnvironmentPrincipal } from '../auth/environment-key.guard'
import { EnvironmentKeyGuard } from '../auth/environment-key.guard'
import { EnvironmentScopeGuard } from '../auth/environment-scope.guard'
import { CurrentEnvironmentPrincipal } from '../auth/current-environment-principal.decorator'
import { RequireEnvironmentScopes } from '../auth/require-environment-scopes.decorator'
import { IdempotencyKey } from './idempotency-key.decorator'
import { PublicValidationPipe } from './public-validation.pipe'
import { PublicRuntimeService } from './public-runtime.service'

@Controller('environments/:environmentId/conversations')
@OptionalAuth()
@UseGuards(EnvironmentKeyGuard, EnvironmentScopeGuard)
export class EnvironmentConversationsController {
  constructor(private readonly runtime: PublicRuntimeService) {}

  @Post()
  @RequireEnvironmentScopes('conversations:write')
  create(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new PublicValidationPipe(createEnvironmentConversationSchema))
    body: CreateEnvironmentConversation,
  ) {
    return this.runtime.createEnvironmentConversation(
      principal,
      body,
      idempotencyKey,
    )
  }

  @Get()
  @RequireEnvironmentScopes('conversations:read')
  list(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.runtime.listEnvironmentConversations(principal, query)
  }

  @Get(':conversationId')
  @RequireEnvironmentScopes('conversations:read')
  get(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @Param('conversationId', new PublicValidationPipe(publicRuntimeIdSchema))
    conversationId: string,
  ) {
    return this.runtime.getEnvironmentConversation(principal, conversationId)
  }
}
