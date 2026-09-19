import { Global, Module } from "@nestjs/common"
import { WorkflowQueueService } from "./workflow-queue.service"
import { WebhookQueueService } from "./webhook-queue.service"

@Global()
@Module({
  providers: [WorkflowQueueService, WebhookQueueService],
  exports: [WorkflowQueueService, WebhookQueueService],
})
export class QueueModule {}
