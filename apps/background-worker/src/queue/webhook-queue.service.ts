import { Injectable, type OnModuleDestroy } from "@nestjs/common"
import {
  closeQueueConnection,
  createConnection,
  createWebhookDeliveryQueue,
  enqueueWebhookDelivery,
  type WebhookDeliveryJob,
} from "@linea/queue"
import type { Queue } from "bullmq"
import type { Redis } from "ioredis"

const ENQUEUE_TIMEOUT_MS = 10_000

@Injectable()
export class WebhookQueueService implements OnModuleDestroy {
  private readonly connection: Redis
  private readonly queue: Queue<WebhookDeliveryJob>

  constructor() {
    this.connection = createConnection()
    this.queue = createWebhookDeliveryQueue(this.connection)
  }

  async enqueue(deliveryId: string): Promise<void> {
    let timeout: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out enqueueing webhook after ${ENQUEUE_TIMEOUT_MS}ms`
            )
          ),
        ENQUEUE_TIMEOUT_MS
      )
    })
    try {
      await Promise.race([
        enqueueWebhookDelivery(this.queue, { deliveryId }),
        timeoutPromise,
      ])
    } finally {
      clearTimeout(timeout!)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await closeQueueConnection(this.queue, this.connection)
  }
}
