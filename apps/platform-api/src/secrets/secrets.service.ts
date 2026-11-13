import { Injectable, NotFoundException } from '@nestjs/common'
import { isPlatformModelKeyAvailable, providers } from '@linea/ai'
import { db, encryptSecret, repositories } from '@linea/db'
import type { UpsertSecretDto } from './dto/upsert-secret.dto'

export type SecretSummary = {
  id: string
  key: string
  createdAt: Date
  updatedAt: Date
}

export type AiProviderKeyStatus = {
  id: string
  label: string
  keyName: string
  configured: boolean
  /** Whether a run without this Environment's key would use Linea's own key; false means it fails. */
  platformFallback: boolean
}

@Injectable()
export class SecretsService {
  private async requireEnvironment(
    workspaceId: string,
    environmentId: string,
  ): Promise<void> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      workspaceId,
      environmentId,
    )
    if (!environment) throw new NotFoundException('Environment not found')
  }
  async list(
    workspaceId: string,
    environmentId: string,
  ): Promise<SecretSummary[]> {
    await this.requireEnvironment(workspaceId, environmentId)
    const secrets = await repositories.secret.listSecrets(db, environmentId)
    return secrets.map(({ id, key, createdAt, updatedAt }) => ({
      id,
      key,
      createdAt,
      updatedAt,
    }))
  }

  async upsert(
    workspaceId: string,
    environmentId: string,
    key: string,
    input: UpsertSecretDto,
  ): Promise<SecretSummary> {
    await this.requireEnvironment(workspaceId, environmentId)
    const secret = await repositories.secret.upsertSecret(
      db,
      environmentId,
      key,
      encryptSecret(input.value),
    )
    return {
      id: secret.id,
      key: secret.key,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    }
  }

  /** configured never reveals the value — just whether this Environment has overridden the platform default for that provider. */
  async listAiProviders(
    workspaceId: string,
    environmentId: string,
  ): Promise<AiProviderKeyStatus[]> {
    await this.requireEnvironment(workspaceId, environmentId)
    const configuredKeys = new Set(
      (await repositories.secret.listSecrets(db, environmentId)).map(
        (secret) => secret.key,
      ),
    )
    return Promise.all(
      providers.map(async (provider) => ({
        id: provider.id,
        label: provider.label,
        keyName: provider.keyName,
        configured: configuredKeys.has(provider.keyName),
        platformFallback: await isPlatformModelKeyAvailable(
          db,
          workspaceId,
          provider.keyName,
        ),
      })),
    )
  }

  async delete(
    workspaceId: string,
    environmentId: string,
    key: string,
  ): Promise<void> {
    await this.requireEnvironment(workspaceId, environmentId)
    const deleted = await repositories.secret.deleteSecret(
      db,
      environmentId,
      key,
    )
    if (!deleted) {
      throw new NotFoundException('Secret not found')
    }
  }
}
