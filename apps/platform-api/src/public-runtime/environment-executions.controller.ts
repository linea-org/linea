import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  startEnvironmentExecutionSchema,
  publicRuntimeIdSchema,
  type StartEnvironmentExecution,
} from '@linea/protocol/resources'
import type { Response } from 'express'
import type { EnvironmentPrincipal } from '../auth/environment-key.guard'
import { EnvironmentKeyGuard } from '../auth/environment-key.guard'
import { EnvironmentScopeGuard } from '../auth/environment-scope.guard'
import { CurrentEnvironmentPrincipal } from '../auth/current-environment-principal.decorator'
import { RequireEnvironmentScopes } from '../auth/require-environment-scopes.decorator'
import { IdempotencyKey } from './idempotency-key.decorator'
import { PublicValidationPipe } from './public-validation.pipe'
import { PublicRuntimeService } from './public-runtime.service'

@Controller()
@OptionalAuth()
@UseGuards(EnvironmentKeyGuard, EnvironmentScopeGuard)
export class EnvironmentExecutionsController {
  constructor(private readonly runtime: PublicRuntimeService) {}

  @Post('environments/:environmentId/executions')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireEnvironmentScopes('executions:start')
  async start(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new PublicValidationPipe(startEnvironmentExecutionSchema))
    body: StartEnvironmentExecution,
    @Res({ passthrough: true }) response: Response,
  ) {
    const execution = await this.runtime.startEnvironmentExecution(
      principal,
      body,
      idempotencyKey,
    )
    response.setHeader('Location', `/v1/executions/${execution.id}`)
    return execution
  }

  @Get('executions/:executionId')
  @RequireEnvironmentScopes('executions:read')
  get(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @Param('executionId', new PublicValidationPipe(publicRuntimeIdSchema))
    executionId: string,
  ) {
    return this.runtime.getEnvironmentExecution(principal, executionId)
  }

  @Post('executions/:executionId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireEnvironmentScopes('executions:cancel')
  cancel(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Param('executionId', new PublicValidationPipe(publicRuntimeIdSchema))
    executionId: string,
  ) {
    return this.runtime.cancelEnvironmentExecution(
      principal,
      executionId,
      idempotencyKey,
    )
  }
}
