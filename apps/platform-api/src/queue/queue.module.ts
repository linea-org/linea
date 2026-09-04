import { Global, Module } from '@nestjs/common'
import { EvalRunQueueService } from './eval-run-queue.service'
import { StepReplayQueueService } from './step-replay-queue.service'
import { WorkflowQueueService } from './workflow-queue.service'

@Global()
@Module({
  providers: [
    WorkflowQueueService,
    StepReplayQueueService,
    EvalRunQueueService,
  ],
  exports: [WorkflowQueueService, StepReplayQueueService, EvalRunQueueService],
})
export class QueueModule {}
