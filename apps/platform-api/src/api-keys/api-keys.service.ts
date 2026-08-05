import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type ApiKey } from '@linea/db'
import { generateApiKey } from '../auth/api-key.util'
import type { CreateApiKeyDto } from './dto/create-api-key.dto'

export type PublicApiKey = Omit<ApiKey, 'hashedKey'>

function toPublicApiKey(apiKey: ApiKey): PublicApiKey {
  return {
    id: apiKey.id,
    workspaceId: apiKey.workspaceId,
    name: apiKey.name,
    purpose: apiKey.purpose,
    keyPrefix: apiKey.keyPrefix,
    lastUsedAt: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
    revokedAt: apiKey.revokedAt,
  }
}

@Injectable()
export class ApiKeysService {
  // The raw key is returned once, here, and never persisted — only its hash is stored.
  async create(
    workspaceId: string,
    input: CreateApiKeyDto,
  ): Promise<PublicApiKey & { rawKey: string }> {
    const { rawKey, hashedKey, keyPrefix } = generateApiKey()
    const apiKey = await repositories.apiKey.createApiKey(db, {
      workspaceId,
      name: input.name,
      hashedKey,
      keyPrefix,
    })
    return { ...toPublicApiKey(apiKey), rawKey }
  }

  async list(workspaceId: string): Promise<PublicApiKey[]> {
    const apiKeys = await repositories.apiKey.listApiKeys(db, workspaceId)
    return apiKeys.map(toPublicApiKey)
  }

  async revoke(workspaceId: string, id: string): Promise<PublicApiKey> {
    const apiKey = await repositories.apiKey.revokeApiKey(db, workspaceId, id)
    if (!apiKey) {
      throw new NotFoundException('API key not found')
    }
    return toPublicApiKey(apiKey)
  }
}
