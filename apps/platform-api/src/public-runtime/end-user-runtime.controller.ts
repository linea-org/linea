import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UseFilters,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  createEndUserConversationSchema,
  createMessageSchema,
  publicRuntimeIdSchema,
  startEndUserExecutionSchema,
  type CreateEndUserConversation,
  type CreateMessage,
  type StartEndUserExecution,
} from '@linea/protocol/resources'
import {
  paginationQuerySchema,
  type PaginationQuery,
} from '@linea/protocol/shared'
import type { Response } from 'express'
import { CurrentEndUser } from '../end-user-sessions/current-end-user.decorator'
import {
  EndUserSessionGuard,
  type EndUserPrincipal,
} from '../end-user-sessions/end-user-session.guard'
import { PublicRuntimeService } from './public-runtime.service'
import { IdempotencyKey } from './idempotency-key.decorator'
import { PublicRuntimeRateLimitFilter } from './public-runtime-rate-limit.filter'
import { PublicValidationPipe } from './public-validation.pipe'

@Controller('user')
@OptionalAuth()
@UseGuards(EndUserSessionGuard)
@UseFilters(PublicRuntimeRateLimitFilter)
export class EndUserRuntimeController {
  constructor(private readonly runtime: PublicRuntimeService) {}

  @Post('conversations')
  createConversation(
    @CurrentEndUser() principal: EndUserPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new PublicValidationPipe(createEndUserConversationSchema))
    body: CreateEndUserConversation,
  ) {
    return this.runtime.createEndUserConversation(
      principal,
      body,
      idempotencyKey,
    )
  }

  @Get('conversations')
  listConversations(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.runtime.listEndUserConversations(principal, query)
  }

  @Get('conversations/:conversationId')
  getConversation(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('conversationId', new PublicValidationPipe(publicRuntimeIdSchema))
    conversationId: string,
  ) {
    return this.runtime.getEndUserConversation(principal, conversationId)
  }

  @Post('conversations/:conversationId/messages')
  createMessage(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('conversationId', new PublicValidationPipe(publicRuntimeIdSchema))
    conversationId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new PublicValidationPipe(createMessageSchema)) body: CreateMessage,
  ) {
    return this.runtime.createEndUserMessage(
      principal,
      conversationId,
      body,
      idempotencyKey,
    )
  }

  @Get('conversations/:conversationId/messages')
  listMessages(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('conversationId', new PublicValidationPipe(publicRuntimeIdSchema))
    conversationId: string,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.runtime.listEndUserMessages(principal, conversationId, query)
  }

  @Post('executions')
  @HttpCode(HttpStatus.ACCEPTED)
  async startExecution(
    @CurrentEndUser() principal: EndUserPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new PublicValidationPipe(startEndUserExecutionSchema))
    body: StartEndUserExecution,
    @Res({ passthrough: true }) response: Response,
  ) {
    const execution = await this.runtime.startEndUserExecution(
      principal,
      body,
      idempotencyKey,
    )
    response.setHeader('Location', `/v1/user/executions/${execution.id}`)
    return execution
  }

  @Get('executions/:executionId')
  getExecution(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('executionId', new PublicValidationPipe(publicRuntimeIdSchema))
    executionId: string,
  ) {
    return this.runtime.getEndUserExecution(principal, executionId)
  }
}
