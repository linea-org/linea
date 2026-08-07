import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories, type Schedule } from "@linea/db"
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

  // Skips a tick already in flight, so a slow poll doesn't stack a second on top of it.
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const claimed = await repositories.schedule.claimDueSchedules(db)
      for (const schedule of claimed) {
        await this.fire(schedule)
      }
    } catch (error) {
      this.logger.error(
        `Schedule poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }

  private async fire(schedule: Schedule): Promise<void> {
    const result = await repositories.execution.triggerWorkflowExecution(
      db,
      schedule.workspaceId,
      { by: "id", value: schedule.workflowId },
      { trigger: "schedule" }
    )
    if (result.outcome !== "created") {
      this.logger.warn(`Schedule ${schedule.id} skipped: ${result.outcome}`)
      return
    }

    try {
      await this.queue.enqueue(result.execution.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.failQueuedExecution(
        db,
        result.execution.id,
        { message }
      )
      this.logger.error(
        `Failed to enqueue execution ${result.execution.id} for schedule ${schedule.id}: ${message}`
      )
    }
  }
}
