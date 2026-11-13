import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type ApiKey } from '@linea/db'
import { generateApiKey } from '../auth/api-key.util'
import type { CreateApiKeyDto } from './dto/create-api-key.dto'

const DAY_MS = 86_400_000

export type PublicApiKey = Omit<ApiKey, 'hashedKey'>

type ApiKeyCreator = repositories.apiKey.ApiKeyCreator

function toPublicApiKey(apiKey: ApiKey): PublicApiKey {
  return {
    id: apiKey.id,
    workspaceId: apiKey.workspaceId,
    name: apiKey.name,
    scopes: apiKey.scopes,
    keyPrefix: apiKey.keyPrefix,
    createdByUserId: apiKey.createdByUserId,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
    revokedAt: apiKey.revokedAt,
  }
}

@Injectable()
export class ApiKeysService {
  // The raw key is returned once, here, and never persisted — only its hash is stored.
  async create(
    workspaceId: string,
    createdByUserId: string,
    input: CreateApiKeyDto,
  ): Promise<PublicApiKey & { rawKey: string }> {
    const { rawKey, hashedKey, keyPrefix } = generateApiKey()
    const apiKey = await repositories.apiKey.createApiKey(db, {
      workspaceId,
      createdByUserId,
      name: input.name,
      scopes: input.scopes,
      expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
      hashedKey,
      keyPrefix,
    })
    return { ...toPublicApiKey(apiKey), rawKey }
  }

  async list(
    workspaceId: string,
  ): Promise<(PublicApiKey & { createdBy: ApiKeyCreator | null })[]> {
    const apiKeys = await repositories.apiKey.listApiKeys(db, workspaceId)
    return apiKeys.map((apiKey) => ({
      ...toPublicApiKey(apiKey),
      createdBy: apiKey.createdBy,
    }))
  }

  async revoke(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<PublicApiKey> {
    const apiKey = await repositories.apiKey.revokeApiKey(
      db,
      workspaceId,
      id,
      actorUserId,
    )
    if (!apiKey) {
      throw new NotFoundException('API key not found')
    }
    return toPublicApiKey(apiKey)
  }
}
