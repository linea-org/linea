import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { CurrentApplicationPrincipal } from '../auth/current-application-principal.decorator'
import { RequireApplicationScopes } from '../auth/require-application-scopes.decorator'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ApplicationRuntimeService } from './application-runtime.service'
import {
  startApplicationExecutionSchema,
  type StartApplicationExecutionDto,
} from './dto/start-application-execution.dto'

@Controller('applications/:applicationId/executions')
@OptionalAuth()
@UseGuards(ApplicationKeyGuard, ApplicationScopeGuard)
@RequireApplicationScopes('executions:start')
export class ApplicationRuntimeController {
  constructor(private readonly runtime: ApplicationRuntimeService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  start(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @Body(new ZodValidationPipe(startApplicationExecutionSchema))
    body: StartApplicationExecutionDto,
  ) {
    return this.runtime.start(principal, body)
  }
}
