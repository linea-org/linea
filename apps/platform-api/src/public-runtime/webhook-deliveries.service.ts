import { Injectable } from '@nestjs/common'
import { db, repositories, type WebhookDelivery } from '@linea/db'
import { webhookEnvelopeSchema } from '@linea/protocol/webhooks'
import type { PaginationQuery } from '@linea/protocol/shared'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import {
  decodeWebhookDeliveryCursor,
  encodeWebhookDeliveryCursor,
} from './public-pagination'

const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

function deliveryProjection(delivery: WebhookDelivery) {
  return {
    id: delivery.id,
    webhookId: delivery.webhookId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    status: delivery.status,
    url: delivery.url,
    envelope: webhookEnvelopeSchema.parse(JSON.parse(delivery.body)),
    attempts: delivery.attempts,
    responseStatus: delivery.responseStatus,
    responseBody: delivery.responseBody,
    lastError: delivery.lastError,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    failedAt: delivery.failedAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
  }
}

@Injectable()
export class WebhookDeliveriesService {
  async list(principal: ApplicationPrincipal, query: PaginationQuery) {
    const deliveries = await repositories.webhookDelivery.listWebhookDeliveries(
      db,
      {
        workspaceId: principal.workspaceId,
        applicationId: principal.applicationId,
        retainedAfter: new Date(Date.now() - RETENTION_MS),
        limit: query.limit + 1,
        cursor: decodeWebhookDeliveryCursor(query.cursor),
      },
    )
    const page = deliveries.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: page.map(deliveryProjection),
      nextCursor:
        deliveries.length > query.limit && last
          ? encodeWebhookDeliveryCursor(last)
          : null,
    }
  }
}
