import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import type { Job, Worker } from "bullmq"
import {
  createConnection,
  createWorkflowExecutionWorker,
  type WorkflowExecutionJob,
} from "@linea/queue"
import { RunsService } from "./runs.service"

@Injectable()
export class RunsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunsConsumer.name)
  private worker?: Worker<WorkflowExecutionJob>

  constructor(private readonly runs: RunsService) {}

  onModuleInit(): void {
    const connection = createConnection()
    this.worker = createWorkflowExecutionWorker(
      connection,
      async (job: Job<WorkflowExecutionJob>) => {
        await this.runs.execute(job.data.executionId)
      }
    )

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Execution ${job?.data.executionId} failed: ${error.message}`
      )
    })
  }

  async onModuleDestroy(): Promise<void> {
    // Same rationale as closeQueueConnection in @linea/queue: wait for BullMQ's internal connection wrapper to finish initializing (listeners still attached) before close() strips them, or a stray late rejection throws as unhandled.
    await this.worker?.waitUntilReady().catch(() => {})
    await this.worker?.close()
  }
}
