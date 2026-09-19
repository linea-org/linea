import { randomBytes } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  db,
  encryptSecret,
  repositories,
  type WebhookEndpoint,
} from '@linea/db'
import type {
  CreateWebhookDto,
  UpdateWebhookDto,
} from './dto/webhook-input.dto'

const PREVIOUS_SECRET_GRACE_MS = 24 * 60 * 60 * 1_000

export type PublicWebhookEndpoint = Omit<
  WebhookEndpoint,
  'currentSecretEncrypted' | 'previousSecretEncrypted'
>

function publicWebhook(webhook: WebhookEndpoint): PublicWebhookEndpoint {
  return {
    id: webhook.id,
    workspaceId: webhook.workspaceId,
    applicationId: webhook.applicationId,
    url: webhook.url,
    previousSecretExpiresAt: webhook.previousSecretExpiresAt,
    disabledAt: webhook.disabledAt,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  }
}

function generateSecret(): string {
  return randomBytes(32).toString('base64url')
}

@Injectable()
export class ApplicationWebhooksService {
  async create(
    workspaceId: string,
    applicationId: string,
    actorUserId: string,
    input: CreateWebhookDto,
  ): Promise<PublicWebhookEndpoint & { secret: string }> {
    const secret = generateSecret()
    const webhook = await repositories.webhookEndpoint.createWebhookEndpoint(
      db,
      {
        workspaceId,
        applicationId,
        actorUserId,
        url: input.url,
        currentSecretEncrypted: encryptSecret(secret),
      },
    )
    if (!webhook) throw new NotFoundException('Application not found')
    return { ...publicWebhook(webhook), secret }
  }

  async list(
    workspaceId: string,
    applicationId: string,
  ): Promise<PublicWebhookEndpoint[]> {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    const webhooks = await repositories.webhookEndpoint.listWebhookEndpoints(
      db,
      workspaceId,
      applicationId,
    )
    return webhooks.map(publicWebhook)
  }

  async update(
    workspaceId: string,
    applicationId: string,
    webhookId: string,
    actorUserId: string,
    input: UpdateWebhookDto,
  ): Promise<PublicWebhookEndpoint> {
    const webhook = await repositories.webhookEndpoint.updateWebhookEndpoint(
      db,
      {
        workspaceId,
        applicationId,
        webhookId,
        actorUserId,
        url: input.url,
      },
    )
    if (!webhook) throw new NotFoundException('Webhook not found')
    return publicWebhook(webhook)
  }

  async rotate(
    workspaceId: string,
    applicationId: string,
    webhookId: string,
    actorUserId: string,
  ): Promise<PublicWebhookEndpoint & { secret: string }> {
    const now = new Date()
    const secret = generateSecret()
    const result = await repositories.webhookEndpoint.rotateWebhookSecret(db, {
      workspaceId,
      applicationId,
      webhookId,
      actorUserId,
      now,
      previousSecretExpiresAt: new Date(
        now.getTime() + PREVIOUS_SECRET_GRACE_MS,
      ),
      currentSecretEncrypted: encryptSecret(secret),
    })
    if (result.outcome === 'not_found') {
      throw new NotFoundException('Webhook not found')
    }
    if (result.outcome === 'rotation_in_progress') {
      throw new ConflictException('Previous-secret grace period is active')
    }
    if (result.outcome !== 'rotated') {
      throw new Error('Webhook rotation returned an invalid outcome')
    }
    return { ...publicWebhook(result.webhook), secret }
  }

  async disable(
    workspaceId: string,
    applicationId: string,
    webhookId: string,
    actorUserId: string,
  ): Promise<PublicWebhookEndpoint> {
    const webhook = await repositories.webhookEndpoint.disableWebhookEndpoint(
      db,
      { workspaceId, applicationId, webhookId, actorUserId, now: new Date() },
    )
    if (!webhook) throw new NotFoundException('Webhook not found')
    return publicWebhook(webhook)
  }
}
