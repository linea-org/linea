import { Module } from '@nestjs/common'
import { RealtimeModule } from '../realtime/realtime.module'
import { WorkflowsController } from './workflows.controller'
import { WorkflowsService } from './workflows.service'

@Module({
  imports: [RealtimeModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
