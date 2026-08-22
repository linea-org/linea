import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

const POLL_INTERVAL_MS = 5_000

@Injectable()
export class WaitFiringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaitFiringService.name)
  private interval?: NodeJS.Timeout
  private polling = false

  constructor(private readonly queue: WorkflowQueueService) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  // Skips overlapping ticks — each claimAndResolveDueWaitTimer call is atomic, so a mid-loop error just leaves the rest due again next tick.
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      let result = await repositories.waitTimer.claimAndResolveDueWaitTimer(db)
      while (result.outcome !== "empty") {
        await this.enqueue(result.waitTimer.executionId, result.waitTimer.id)
        result = await repositories.waitTimer.claimAndResolveDueWaitTimer(db)
      }
    } catch (error) {
      this.logger.error(
        `Wait timer poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }

  // No caller waiting to retry a resume, so this never fails the execution — matches ApprovalTimeoutService's own enqueue-failure handling.
  private async enqueue(
    executionId: string,
    waitTimerId: string
  ): Promise<void> {
    try {
      await this.queue.enqueue(executionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.recordEnqueueFailure(db, executionId)
      this.logger.error(
        `Failed to enqueue execution ${executionId} after wait timer ${waitTimerId} fired, will retry via sweep: ${message}`
      )
    }
  }
}
