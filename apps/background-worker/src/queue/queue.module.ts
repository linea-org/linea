import { Global, Module } from "@nestjs/common"
import { WorkflowQueueService } from "./workflow-queue.service"

@Global()
@Module({
  providers: [WorkflowQueueService],
  exports: [WorkflowQueueService],
})
export class QueueModule {}
