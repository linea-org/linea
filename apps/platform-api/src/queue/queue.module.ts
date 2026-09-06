import { Global, Module } from '@nestjs/common'
import { RegressionRunQueueService } from './regression-run-queue.service'
import { StepReplayQueueService } from './step-replay-queue.service'
import { WorkflowQueueService } from './workflow-queue.service'

@Global()
@Module({
  providers: [
    WorkflowQueueService,
    StepReplayQueueService,
    RegressionRunQueueService,
  ],
  exports: [
    WorkflowQueueService,
    StepReplayQueueService,
    RegressionRunQueueService,
  ],
})
export class QueueModule {}
