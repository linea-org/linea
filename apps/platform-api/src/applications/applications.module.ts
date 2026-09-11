import { Module } from '@nestjs/common'
import { ApplicationsController } from './applications.controller'
import { ApplicationsService } from './applications.service'
import { ApplicationWorkflowBindingsController } from './application-workflow-bindings.controller'
import { ApplicationWorkflowBindingsService } from './application-workflow-bindings.service'
import { ApplicationKeysController } from './application-keys.controller'
import { ApplicationKeysService } from './application-keys.service'
import { ApplicationRuntimeController } from './application-runtime.controller'
import { ApplicationRuntimeService } from './application-runtime.service'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'

@Module({
  controllers: [
    ApplicationsController,
    ApplicationWorkflowBindingsController,
    ApplicationKeysController,
    ApplicationRuntimeController,
  ],
  providers: [
    ApplicationsService,
    ApplicationWorkflowBindingsService,
    ApplicationKeysService,
    ApplicationRuntimeService,
    ApplicationKeyGuard,
    ApplicationScopeGuard,
  ],
})
export class ApplicationsModule {}
