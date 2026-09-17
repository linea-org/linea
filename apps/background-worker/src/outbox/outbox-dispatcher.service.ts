import { randomUUID } from "node:crypto"
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories, type OutboxMessage } from "@linea/db"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

const POLL_INTERVAL_MS = 1_000
const CLAIM_LEASE_MS = 30_000
const MAXIMUM_ATTEMPTS = 10
const MAXIMUM_RETRY_DELAY_MS = 60_000
const MAXIMUM_ERROR_LENGTH = 4_096

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name)
  private readonly dispatcherId = randomUUID()
  private interval?: NodeJS.Timeout
  private polling = false

  constructor(private readonly queue: WorkflowQueueService) {}

  onModuleInit(): void {
    void this.poll()
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      let message = await this.claim()
      while (message) {
        await this.dispatch(message)
        message = await this.claim()
      }
    } catch (error) {
      this.logger.error(
        `Outbox poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }

  private claim() {
    const now = new Date()
    return repositories.outboxMessage.claimWorkflowExecutionMessage(db, {
      claimedBy: this.dispatcherId,
      now,
      claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
    })
  }

  private async dispatch(message: OutboxMessage): Promise<void> {
    const payloadExecutionId = message.payload.executionId
    const executionId =
      typeof payloadExecutionId === "string" ? payloadExecutionId : undefined
    try {
      if (!executionId) {
        throw new Error("Workflow execution outbox payload has no executionId")
      }
      await this.queue.enqueue(executionId, message.id)
      const published =
        await repositories.outboxMessage.markOutboxMessagePublished(db, {
          messageId: message.id,
          claimedBy: this.dispatcherId,
          publishedAt: new Date(),
        })
      if (!published) throw new Error("Outbox claim was lost after publication")
    } catch (error) {
      const failedAt = new Date()
      const retryDelay = Math.min(
        2 ** (message.attempts - 1) * 1_000,
        MAXIMUM_RETRY_DELAY_MS
      )
      const failure =
        await repositories.outboxMessage.recordOutboxMessageFailure(db, {
          messageId: message.id,
          claimedBy: this.dispatcherId,
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            MAXIMUM_ERROR_LENGTH
          ),
          failedAt,
          retryAt: new Date(failedAt.getTime() + retryDelay),
          maximumAttempts: MAXIMUM_ATTEMPTS,
        })
      if (failure?.status === "failed") {
        this.logger.error(`Outbox message ${message.id} permanently failed`)
      }
    }
  }
}
