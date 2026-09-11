import { Module } from '@nestjs/common'
import { ApplicationsController } from './applications.controller'
import { ApplicationsService } from './applications.service'
import { ApplicationWorkflowBindingsController } from './application-workflow-bindings.controller'
import { ApplicationWorkflowBindingsService } from './application-workflow-bindings.service'
import { ApplicationKeysController } from './application-keys.controller'
import { ApplicationKeysService } from './application-keys.service'

@Module({
  controllers: [
    ApplicationsController,
    ApplicationWorkflowBindingsController,
    ApplicationKeysController,
  ],
  providers: [
    ApplicationsService,
    ApplicationWorkflowBindingsService,
    ApplicationKeysService,
  ],
})
export class ApplicationsModule {}
