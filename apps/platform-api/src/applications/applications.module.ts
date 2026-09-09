import { Module } from '@nestjs/common'
import { ApplicationsController } from './applications.controller'
import { ApplicationsService } from './applications.service'
import { ApplicationWorkflowBindingsController } from './application-workflow-bindings.controller'
import { ApplicationWorkflowBindingsService } from './application-workflow-bindings.service'

@Module({
  controllers: [ApplicationsController, ApplicationWorkflowBindingsController],
  providers: [ApplicationsService, ApplicationWorkflowBindingsService],
})
export class ApplicationsModule {}
