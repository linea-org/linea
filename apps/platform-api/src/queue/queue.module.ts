import { Global, Module } from '@nestjs/common'
import { RegressionRunQueueService } from './regression-run-queue.service'
import { StepReplayQueueService } from './step-replay-queue.service'

@Global()
@Module({
  providers: [StepReplayQueueService, RegressionRunQueueService],
  exports: [StepReplayQueueService, RegressionRunQueueService],
})
export class QueueModule {}
