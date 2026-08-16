import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import type { Job, Worker } from "bullmq"
import {
  createConnection,
  createWorkflowStepReplayWorker,
  type WorkflowStepReplayJob,
} from "@linea/queue"
import { ReplayService } from "./replay.service"

@Injectable()
export class ReplayConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReplayConsumer.name)
  private worker?: Worker<WorkflowStepReplayJob>

  constructor(private readonly replay: ReplayService) {}

  onModuleInit(): void {
    const connection = createConnection()
    this.worker = createWorkflowStepReplayWorker(
      connection,
      async (job: Job<WorkflowStepReplayJob>) => {
        await this.replay.replay(job.data)
      }
    )

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Replay ${job?.data.replayStepId} failed: ${error.message}`
      )
    })
  }

  async onModuleDestroy(): Promise<void> {
    // Same rationale as closeQueueConnection in @linea/queue: wait for BullMQ's internal connection wrapper to finish initializing (listeners still attached) before close() strips them, or a stray late rejection throws as unhandled.
    await this.worker?.waitUntilReady().catch(() => {})
    await this.worker?.close()
  }
}
