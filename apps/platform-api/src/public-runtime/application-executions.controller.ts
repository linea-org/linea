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
  startApplicationExecutionSchema,
  publicRuntimeIdSchema,
  type StartApplicationExecution,
} from '@linea/protocol/resources'
import type { Response } from 'express'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { CurrentApplicationPrincipal } from '../auth/current-application-principal.decorator'
import { RequireApplicationScopes } from '../auth/require-application-scopes.decorator'
import { IdempotencyKey } from './idempotency-key.decorator'
import { PublicValidationPipe } from './public-validation.pipe'
import { PublicRuntimeService } from './public-runtime.service'

@Controller()
@OptionalAuth()
@UseGuards(ApplicationKeyGuard, ApplicationScopeGuard)
export class ApplicationExecutionsController {
  constructor(private readonly runtime: PublicRuntimeService) {}

  @Post('applications/:applicationId/executions')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireApplicationScopes('executions:start')
  async start(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new PublicValidationPipe(startApplicationExecutionSchema))
    body: StartApplicationExecution,
    @Res({ passthrough: true }) response: Response,
  ) {
    const execution = await this.runtime.startApplicationExecution(
      principal,
      body,
      idempotencyKey,
    )
    response.setHeader('Location', `/v1/executions/${execution.id}`)
    return execution
  }

  @Get('executions/:executionId')
  @RequireApplicationScopes('executions:read')
  get(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @Param('executionId', new PublicValidationPipe(publicRuntimeIdSchema))
    executionId: string,
  ) {
    return this.runtime.getApplicationExecution(principal, executionId)
  }

  @Post('executions/:executionId/cancel')
  @RequireApplicationScopes('executions:cancel')
  cancel(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @IdempotencyKey() idempotencyKey: string,
    @Param('executionId', new PublicValidationPipe(publicRuntimeIdSchema))
    executionId: string,
  ) {
    return this.runtime.cancelApplicationExecution(
      principal,
      executionId,
      idempotencyKey,
    )
  }
}
