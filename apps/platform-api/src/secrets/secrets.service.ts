import { Injectable, NotFoundException } from '@nestjs/common'
import { providers } from '@linea/ai'
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
}

@Injectable()
export class SecretsService {
  async list(workspaceId: string): Promise<SecretSummary[]> {
    const secrets = await repositories.secret.listSecrets(db, workspaceId)
    return secrets.map(({ id, key, createdAt, updatedAt }) => ({
      id,
      key,
      createdAt,
      updatedAt,
    }))
  }

  async upsert(
    workspaceId: string,
    key: string,
    input: UpsertSecretDto,
  ): Promise<SecretSummary> {
    const secret = await repositories.secret.upsertSecret(
      db,
      workspaceId,
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

  /** configured never reveals the value — just whether this workspace has overridden the platform default for that provider. */
  async listAiProviders(workspaceId: string): Promise<AiProviderKeyStatus[]> {
    const configuredKeys = new Set(
      (await repositories.secret.listSecrets(db, workspaceId)).map(
        (secret) => secret.key,
      ),
    )
    return providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      keyName: provider.keyName,
      configured: configuredKeys.has(provider.keyName),
    }))
  }

  async delete(workspaceId: string, key: string): Promise<void> {
    const deleted = await repositories.secret.deleteSecret(db, workspaceId, key)
    if (!deleted) {
      throw new NotFoundException('Secret not found')
    }
  }
}
