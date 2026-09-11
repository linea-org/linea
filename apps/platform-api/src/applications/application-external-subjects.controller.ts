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
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { CurrentApplicationPrincipal } from '../auth/current-application-principal.decorator'
import { RequireApplicationScopes } from '../auth/require-application-scopes.decorator'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ExternalSubjectsService } from './external-subjects.service'

@Controller('applications/:applicationId/subjects')
@OptionalAuth()
@UseGuards(ApplicationKeyGuard, ApplicationScopeGuard)
@RequireApplicationScopes('subjects:provision')
export class ApplicationExternalSubjectsController {
  constructor(private readonly externalSubjects: ExternalSubjectsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  provision(
    @CurrentApplicationPrincipal() principal: ApplicationPrincipal,
    @Body(new ZodValidationPipe(provisionExternalSubjectSchema))
    body: ProvisionExternalSubject,
  ) {
    return this.externalSubjects.provision(principal, body)
  }
}
