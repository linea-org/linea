import { Injectable, NotFoundException } from '@nestjs/common'
import { db, encryptSecret, repositories } from '@linea/db'
import type { UpsertSecretDto } from './dto/upsert-secret.dto'

export type SecretSummary = {
  id: string
  key: string
  createdAt: Date
  updatedAt: Date
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

  async delete(workspaceId: string, key: string): Promise<void> {
    const deleted = await repositories.secret.deleteSecret(db, workspaceId, key)
    if (!deleted) {
      throw new NotFoundException('Secret not found')
    }
  }
}
