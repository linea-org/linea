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
export class ScheduleFiringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleFiringService.name)
  private interval?: NodeJS.Timeout
  private polling = false

  constructor(private readonly queue: WorkflowQueueService) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  // Skips overlapping ticks — each claimAndFireDueSchedule call is atomic, so a mid-loop error just leaves the rest due again next tick.
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      let result = await repositories.schedule.claimAndFireDueSchedule(db)
      while (result.outcome !== "empty") {
        if (result.outcome === "fired") {
          await this.enqueue(result.execution.id, result.schedule.id)
        } else {
          this.logger.warn(
            `Schedule ${result.schedule.id} skipped: ${result.reason}`
          )
        }
        result = await repositories.schedule.claimAndFireDueSchedule(db)
      }
    } catch (error) {
      this.logger.error(
        `Schedule poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }

  // No caller waiting to retry a schedule, so this never fails the execution — OrphanedExecutionSweepService keeps retrying it.
  private async enqueue(
    executionId: string,
    scheduleId: string
  ): Promise<void> {
    try {
      await this.queue.enqueue(executionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.recordEnqueueFailure(db, executionId)
      this.logger.error(
        `Failed to enqueue execution ${executionId} for schedule ${scheduleId}, will retry via sweep: ${message}`
      )
    }
  }
}
