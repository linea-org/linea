import { randomUUID } from "node:crypto"
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories, type OutboxMessage } from "@linea/db"
import { WorkflowQueueService } from "../queue/workflow-queue.service"
import { WebhookQueueService } from "../queue/webhook-queue.service"

const POLL_INTERVAL_MS = 1_000
const CLAIM_LEASE_MS = 30_000
const MAXIMUM_RETRY_DELAY_MS = 60_000
const MAXIMUM_ERROR_LENGTH = 4_096

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name)
  private readonly dispatcherId = randomUUID()
  private interval?: NodeJS.Timeout
  private polling = false
  private claimPublicEventNext = false

  constructor(
    private readonly queue: WorkflowQueueService,
    private readonly webhookQueue: WebhookQueueService
  ) {}

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

  private async claim() {
    const now = new Date()
    const input = {
      claimedBy: this.dispatcherId,
      now,
      claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
    }
    const first = this.claimPublicEventNext
      ? repositories.outboxMessage.claimPublicEventMessage
      : repositories.outboxMessage.claimWorkflowExecutionMessage
    const second = this.claimPublicEventNext
      ? repositories.outboxMessage.claimWorkflowExecutionMessage
      : repositories.outboxMessage.claimPublicEventMessage
    this.claimPublicEventNext = !this.claimPublicEventNext
    return (await first(db, input)) ?? second(db, input)
  }

  private async dispatch(message: OutboxMessage): Promise<void> {
    const payloadExecutionId = message.payload.executionId
    const executionId =
      typeof payloadExecutionId === "string" ? payloadExecutionId : undefined
    try {
      if (message.kind === "public_event") {
        const deliveries =
          await repositories.webhookDelivery.prepareWebhookDeliveries(db, {
            messageId: message.id,
            claimedBy: this.dispatcherId,
          })
        await Promise.all(
          deliveries.map((delivery) => this.webhookQueue.enqueue(delivery.id))
        )
        const published =
          await repositories.outboxMessage.markOutboxMessagePublished(db, {
            messageId: message.id,
            claimedBy: this.dispatcherId,
            publishedAt: new Date(),
          })
        if (!published) {
          throw new Error("Outbox claim was lost after publication")
        }
        return
      }
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
        2 ** Math.min(message.attempts - 1, 16) * 1_000,
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
          terminal:
            (message.kind === "workflow_execution" && !executionId) ||
            (message.kind === "public_event" &&
              error instanceof
                repositories.webhookDelivery.InvalidWebhookEventError),
        })
      if (failure?.status === "failed") {
        this.logger.error(`Outbox message ${message.id} permanently failed`)
      }
    }
  }
}
