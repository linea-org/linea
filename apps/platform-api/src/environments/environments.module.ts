import { ApplicationsController } from '../applications/applications.controller'
import { Module } from '@nestjs/common'
import { EnvironmentsController } from './environments.controller'
import { EnvironmentsService } from './environments.service'
import { EnvironmentWorkflowBindingsController } from './environment-workflow-bindings.controller'
import { EnvironmentWorkflowBindingsService } from './environment-workflow-bindings.service'
import { EnvironmentKeysController } from './environment-keys.controller'
import { EnvironmentKeysService } from './environment-keys.service'
import { EnvironmentKeyGuard } from '../auth/environment-key.guard'
import { EnvironmentScopeGuard } from '../auth/environment-scope.guard'
import { EnvironmentExternalSubjectsController } from './environment-external-subjects.controller'
import { ExternalSubjectsController } from './external-subjects.controller'
import { ExternalSubjectsService } from './external-subjects.service'
import { EnvironmentWebhooksController } from './environment-webhooks.controller'
import { EnvironmentWebhooksService } from './environment-webhooks.service'

@Module({
  controllers: [
    ApplicationsController,
    EnvironmentsController,
    EnvironmentWorkflowBindingsController,
    EnvironmentKeysController,
    EnvironmentExternalSubjectsController,
    ExternalSubjectsController,
    EnvironmentWebhooksController,
  ],
  providers: [
    EnvironmentsService,
    EnvironmentWorkflowBindingsService,
    EnvironmentKeysService,
    EnvironmentKeyGuard,
    EnvironmentScopeGuard,
    ExternalSubjectsService,
    EnvironmentWebhooksService,
  ],
})
export class EnvironmentsModule {}
