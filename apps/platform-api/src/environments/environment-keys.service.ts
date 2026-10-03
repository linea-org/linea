import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories, type EnvironmentKey } from '@linea/db'
import { generateEnvironmentKey } from '../auth/api-key.util'
import type { CreateEnvironmentKeyDto } from './dto/create-environment-key.dto'

export type PublicEnvironmentKey = Omit<EnvironmentKey, 'hashedKey'>

function toPublicEnvironmentKey(
  environmentKey: EnvironmentKey,
): PublicEnvironmentKey {
  return {
    id: environmentKey.id,
    workspaceId: environmentKey.workspaceId,
    environmentId: environmentKey.environmentId,
    name: environmentKey.name,
    scopes: environmentKey.scopes,
    keyPrefix: environmentKey.keyPrefix,
    lastUsedAt: environmentKey.lastUsedAt,
    createdAt: environmentKey.createdAt,
    revokedAt: environmentKey.revokedAt,
  }
}

@Injectable()
export class EnvironmentKeysService {
  async create(
    workspaceId: string,
    environmentId: string,
    actorUserId: string,
    input: CreateEnvironmentKeyDto,
  ): Promise<PublicEnvironmentKey & { rawKey: string }> {
    const { rawKey, hashedKey, keyPrefix } = generateEnvironmentKey()
    const result = await repositories.environmentKey.createEnvironmentKey(
      db,
      {
        workspaceId,
        environmentId,
        name: input.name,
        scopes: input.scopes,
        hashedKey,
        keyPrefix,
      },
      { userId: actorUserId },
    )
    if (result.outcome === 'environment_not_found') {
      throw new NotFoundException('Environment not found')
    }
    if (result.outcome === 'environment_disabled') {
      throw new ConflictException('Environment is disabled')
    }
    return { ...toPublicEnvironmentKey(result.environmentKey), rawKey }
  }

  async list(
    workspaceId: string,
    environmentId: string,
  ): Promise<PublicEnvironmentKey[]> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      workspaceId,
      environmentId,
    )
    if (!environment) throw new NotFoundException('Environment not found')
    const environmentKeys =
      await repositories.environmentKey.listEnvironmentKeys(
        db,
        workspaceId,
        environmentId,
      )
    return environmentKeys.map(toPublicEnvironmentKey)
  }

  async rotate(
    workspaceId: string,
    environmentId: string,
    id: string,
    actorUserId: string,
  ): Promise<PublicEnvironmentKey & { rawKey: string }> {
    const { rawKey, hashedKey, keyPrefix } = generateEnvironmentKey()
    const environmentKey =
      await repositories.environmentKey.rotateEnvironmentKey(
        db,
        workspaceId,
        environmentId,
        id,
        { hashedKey, keyPrefix },
        { userId: actorUserId },
      )
    if (!environmentKey)
      throw new NotFoundException('Environment key not found')
    return { ...toPublicEnvironmentKey(environmentKey), rawKey }
  }

  async revoke(
    workspaceId: string,
    environmentId: string,
    id: string,
    actorUserId: string,
  ): Promise<PublicEnvironmentKey> {
    const environmentKey =
      await repositories.environmentKey.revokeEnvironmentKey(
        db,
        workspaceId,
        environmentId,
        id,
        { userId: actorUserId },
      )
    if (!environmentKey)
      throw new NotFoundException('Environment key not found')
    return toPublicEnvironmentKey(environmentKey)
  }
}
