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
    await this.worker?.close()
  }
}
