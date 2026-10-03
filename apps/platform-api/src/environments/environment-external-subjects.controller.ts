import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  provisionExternalSubjectSchema,
  type ProvisionExternalSubject,
} from '@linea/protocol/resources'
import type { EnvironmentPrincipal } from '../auth/environment-key.guard'
import { EnvironmentKeyGuard } from '../auth/environment-key.guard'
import { EnvironmentScopeGuard } from '../auth/environment-scope.guard'
import { CurrentEnvironmentPrincipal } from '../auth/current-environment-principal.decorator'
import { RequireEnvironmentScopes } from '../auth/require-environment-scopes.decorator'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ExternalSubjectsService } from './external-subjects.service'

@Controller('environments/:environmentId/subjects')
@OptionalAuth()
@UseGuards(EnvironmentKeyGuard, EnvironmentScopeGuard)
@RequireEnvironmentScopes('subjects:provision')
export class EnvironmentExternalSubjectsController {
  constructor(private readonly externalSubjects: ExternalSubjectsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  provision(
    @CurrentEnvironmentPrincipal() principal: EnvironmentPrincipal,
    @Body(new ZodValidationPipe(provisionExternalSubjectSchema))
    body: ProvisionExternalSubject,
  ) {
    return this.externalSubjects.provision(principal, body)
  }
}
