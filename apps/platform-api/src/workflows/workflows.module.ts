import { Module } from '@nestjs/common'
import { RealtimeModule } from '../realtime/realtime.module'
import { WorkflowsController } from './workflows.controller'
import { WorkflowsService } from './workflows.service'
import { WorkflowContractsController } from './workflow-contracts.controller'
import { WorkflowContractsService } from './workflow-contracts.service'

@Module({
  imports: [RealtimeModule],
  controllers: [WorkflowsController, WorkflowContractsController],
  providers: [WorkflowsService, WorkflowContractsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
