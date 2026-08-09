import { Global, Module } from '@nestjs/common'
import { StepReplayQueueService } from './step-replay-queue.service'
import { WorkflowQueueService } from './workflow-queue.service'

@Global()
@Module({
  providers: [WorkflowQueueService, StepReplayQueueService],
  exports: [WorkflowQueueService, StepReplayQueueService],
})
export class QueueModule {}
