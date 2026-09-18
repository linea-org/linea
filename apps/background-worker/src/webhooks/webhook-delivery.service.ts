import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, decryptSecret, repositories } from "@linea/db"
import {
  WEBHOOK_DELIVERY_ATTEMPTS,
  WEBHOOK_RETRY_BASE_DELAY_MS,
  createConnection,
  createWebhookDeliveryWorker,
  type WebhookDeliveryJob,
} from "@linea/queue"
import type { Worker } from "bullmq"
import type { Redis } from "ioredis"
import {
  deliverWebhook,
  PermanentWebhookError,
  type WebhookResponse,
} from "./webhook-request"
import { signWebhook } from "./webhook-signature"

const MAXIMUM_RETRY_DELAY_MS = 60_000
const MAXIMUM_ERROR_LENGTH = 4_096
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000

@Injectable()
export class WebhookDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryService.name)
  private connection?: Redis
  private worker?: Worker<WebhookDeliveryJob>
  private cleanupInterval?: NodeJS.Timeout

  onModuleInit(): void {
    this.connection = createConnection()
    this.worker = createWebhookDeliveryWorker(this.connection, (job) =>
      this.processDelivery(job.data.deliveryId, job.attemptsMade)
    )
    void this.cleanup().catch((error: unknown) => this.logCleanupError(error))
    this.cleanupInterval = setInterval(
      () =>
        void this.cleanup().catch((error: unknown) =>
          this.logCleanupError(error)
        ),
      CLEANUP_INTERVAL_MS
    )
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.cleanupInterval)
    if (this.worker && this.connection) {
      await this.worker.waitUntilReady().catch(() => {})
      await this.worker.close()
      await this.connection.quit()
    }
  }

  async processDelivery(
    deliveryId: string,
    attemptsMade: number
  ): Promise<void> {
    const now = new Date()
    const claimed = await repositories.webhookDelivery.beginWebhookDelivery(
      db,
      deliveryId,
      now
    )
    if (!claimed) return
    const { delivery, endpoint } = claimed
    let encryptedSecret = endpoint.currentSecretEncrypted
    if (
      delivery.secretVersion === "previous" &&
      endpoint.previousSecretEncrypted &&
      endpoint.previousSecretExpiresAt &&
      endpoint.previousSecretExpiresAt > now
    ) {
      encryptedSecret = endpoint.previousSecretEncrypted
    }
    const secret = decryptSecret(encryptedSecret)
    const body = Buffer.from(delivery.body, "utf8")
    const timestamp = Math.floor(now.getTime() / 1_000).toString()
    let response: WebhookResponse | undefined
    try {
      response = await deliverWebhook({
        url: delivery.url,
        body,
        allowLocalDevelopment: process.env.NODE_ENV === "development",
        headers: {
          "content-type": "application/json",
          "user-agent": "Linea-Webhooks/1.0",
          "x-linea-event-id": delivery.eventId,
          "x-linea-timestamp": timestamp,
          "x-linea-signature": signWebhook(
            secret,
            timestamp,
            delivery.eventId,
            body
          ),
        },
      })
      if (response.status >= 200 && response.status < 300) {
        await repositories.webhookDelivery.completeWebhookDelivery(db, {
          deliveryId: delivery.id,
          deliveredAt: new Date(),
          responseStatus: response.status,
          responseBody: response.body,
        })
        return
      }
      const retryable =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500
      if (!retryable) {
        await this.recordFailure(
          delivery.id,
          `Webhook returned HTTP ${response.status}`,
          response,
          null
        )
        return
      }
      throw new Error(`Webhook returned HTTP ${response.status}`)
    } catch (error) {
      const permanent = error instanceof PermanentWebhookError
      const finalAttempt = attemptsMade + 1 >= WEBHOOK_DELIVERY_ATTEMPTS
      const retryAt =
        permanent || finalAttempt
          ? null
          : new Date(
              Date.now() +
                Math.min(
                  WEBHOOK_RETRY_BASE_DELAY_MS * 2 ** attemptsMade,
                  MAXIMUM_RETRY_DELAY_MS
                )
            )
      await this.recordFailure(
        delivery.id,
        error instanceof Error ? error.message : String(error),
        response,
        retryAt
      )
      if (retryAt) throw error
    }
  }

  private recordFailure(
    deliveryId: string,
    error: string,
    response: WebhookResponse | undefined,
    retryAt: Date | null
  ): Promise<void> {
    return repositories.webhookDelivery.failWebhookDelivery(db, {
      deliveryId,
      failedAt: new Date(),
      error: error.slice(0, MAXIMUM_ERROR_LENGTH),
      responseStatus: response?.status ?? null,
      responseBody: response?.body ?? null,
      retryAt,
    })
  }

  private async cleanup(): Promise<void> {
    await repositories.webhookDelivery.deleteExpiredWebhookDeliveries(
      db,
      new Date(Date.now() - RETENTION_MS)
    )
  }

  private logCleanupError(error: unknown): void {
    this.logger.error(
      `Webhook delivery cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
