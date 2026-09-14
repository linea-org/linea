import { Module } from '@nestjs/common'
import { ApplicationsController } from './applications.controller'
import { ApplicationsService } from './applications.service'
import { ApplicationWorkflowBindingsController } from './application-workflow-bindings.controller'
import { ApplicationWorkflowBindingsService } from './application-workflow-bindings.service'
import { ApplicationKeysController } from './application-keys.controller'
import { ApplicationKeysService } from './application-keys.service'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { ApplicationExternalSubjectsController } from './application-external-subjects.controller'
import { ExternalSubjectsController } from './external-subjects.controller'
import { ExternalSubjectsService } from './external-subjects.service'

@Module({
  controllers: [
    ApplicationsController,
    ApplicationWorkflowBindingsController,
    ApplicationKeysController,
    ApplicationExternalSubjectsController,
    ExternalSubjectsController,
  ],
  providers: [
    ApplicationsService,
    ApplicationWorkflowBindingsService,
    ApplicationKeysService,
    ApplicationKeyGuard,
    ApplicationScopeGuard,
    ExternalSubjectsService,
  ],
})
export class ApplicationsModule {}
