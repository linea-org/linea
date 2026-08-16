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
export class ApprovalTimeoutService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovalTimeoutService.name)
  private interval?: NodeJS.Timeout
  private polling = false

  constructor(private readonly queue: WorkflowQueueService) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  // Skips overlapping ticks — each claimAndResolveTimedOutApproval call is atomic, so a mid-loop error just leaves the rest due again next tick.
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      let result =
        await repositories.approval.claimAndResolveTimedOutApproval(db)
      while (result.outcome !== "empty") {
        await this.enqueue(result.approval.executionId, result.approval.id)
        result = await repositories.approval.claimAndResolveTimedOutApproval(db)
      }
    } catch (error) {
      this.logger.error(
        `Approval timeout poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }

  // No caller waiting to retry a resume, so this never fails the execution — matches ScheduleFiringService's own enqueue-failure handling.
  private async enqueue(
    executionId: string,
    approvalId: string
  ): Promise<void> {
    try {
      await this.queue.enqueue(executionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.recordEnqueueFailure(db, executionId)
      this.logger.error(
        `Failed to enqueue execution ${executionId} after approval ${approvalId} timed out, will retry via sweep: ${message}`
      )
    }
  }
}
