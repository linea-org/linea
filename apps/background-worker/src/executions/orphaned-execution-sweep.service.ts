import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

const SWEEP_INTERVAL_MS = 30_000
const STALE_AFTER_MS = 60_000

/** Recovers executions stuck "queued" from a crash between the DB commit and the enqueue() call, on any trigger path. */
@Injectable()
export class OrphanedExecutionSweepService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrphanedExecutionSweepService.name)
  private interval?: NodeJS.Timeout

  constructor(private readonly queue: WorkflowQueueService) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  // Re-enqueueing a job that already exists is safe: startExecution's atomic claim means only one worker ever leaves "queued".
  async sweep(): Promise<void> {
    try {
      const stale = await repositories.execution.findStaleQueuedExecutions(
        db,
        new Date(Date.now() - STALE_AFTER_MS)
      )
      for (const execution of stale) {
        try {
          await this.queue.enqueue(execution.id)
          this.logger.warn(`Re-enqueued orphaned execution ${execution.id}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await repositories.execution.recordEnqueueFailure(db, execution.id)
          this.logger.error(
            `Failed to re-enqueue orphaned execution ${execution.id}, will retry: ${message}`
          )
        }
      }
    } catch (error) {
      this.logger.error(
        `Orphaned execution sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
