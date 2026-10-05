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
    environmentId: webhook.environmentId,
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
export class EnvironmentWebhooksService {
  async create(
    workspaceId: string,
    environmentId: string,
    actorUserId: string,
    input: CreateWebhookDto,
  ): Promise<PublicWebhookEndpoint & { secret: string }> {
    const secret = generateSecret()
    const webhook = await repositories.webhookEndpoint.createWebhookEndpoint(
      db,
      {
        workspaceId,
        environmentId,
        actorUserId,
        url: input.url,
        currentSecretEncrypted: encryptSecret(secret),
      },
    )
    if (!webhook) throw new NotFoundException('Environment not found')
    return { ...publicWebhook(webhook), secret }
  }

  async list(
    workspaceId: string,
    environmentId: string,
  ): Promise<PublicWebhookEndpoint[]> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      workspaceId,
      environmentId,
    )
    if (!environment) throw new NotFoundException('Environment not found')
    const webhooks = await repositories.webhookEndpoint.listWebhookEndpoints(
      db,
      workspaceId,
      environmentId,
    )
    return webhooks.map(publicWebhook)
  }

  async update(
    workspaceId: string,
    environmentId: string,
    webhookId: string,
    actorUserId: string,
    input: UpdateWebhookDto,
  ): Promise<PublicWebhookEndpoint> {
    const webhook = await repositories.webhookEndpoint.updateWebhookEndpoint(
      db,
      {
        workspaceId,
        environmentId,
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
    environmentId: string,
    webhookId: string,
    actorUserId: string,
  ): Promise<PublicWebhookEndpoint & { secret: string }> {
    const now = new Date()
    const secret = generateSecret()
    const result = await repositories.webhookEndpoint.rotateWebhookSecret(db, {
      workspaceId,
      environmentId,
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
    environmentId: string,
    webhookId: string,
    actorUserId: string,
  ): Promise<PublicWebhookEndpoint> {
    const webhook = await repositories.webhookEndpoint.disableWebhookEndpoint(
      db,
      { workspaceId, environmentId, webhookId, actorUserId, now: new Date() },
    )
    if (!webhook) throw new NotFoundException('Webhook not found')
    return publicWebhook(webhook)
  }
}
