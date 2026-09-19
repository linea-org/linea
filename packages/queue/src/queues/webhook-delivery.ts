import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WEBHOOK_DELIVERY_QUEUE = "webhook-delivery"
export const WEBHOOK_DELIVERY_ATTEMPTS = 6
export const WEBHOOK_RETRY_BASE_DELAY_MS = 1_000
const JOB_NAME = "deliver"

export type WebhookDeliveryJob = {
  deliveryId: string
}

export function createWebhookDeliveryQueue(
  connection: Redis
): Queue<WebhookDeliveryJob> {
  return new Queue<WebhookDeliveryJob>(WEBHOOK_DELIVERY_QUEUE, { connection })
}

export function enqueueWebhookDelivery(
  queue: Queue<WebhookDeliveryJob>,
  job: WebhookDeliveryJob
): Promise<Job<WebhookDeliveryJob>> {
  return queue.add(JOB_NAME, job, {
    jobId: job.deliveryId,
    attempts: WEBHOOK_DELIVERY_ATTEMPTS,
    backoff: { type: "exponential", delay: WEBHOOK_RETRY_BASE_DELAY_MS },
    removeOnComplete: { age: 30 * 24 * 60 * 60 },
    removeOnFail: { age: 30 * 24 * 60 * 60 },
  })
}

export function createWebhookDeliveryWorker(
  connection: Redis,
  processor: Processor<WebhookDeliveryJob>
): Worker<WebhookDeliveryJob> {
  return new Worker<WebhookDeliveryJob>(WEBHOOK_DELIVERY_QUEUE, processor, {
    connection,
  })
}
