import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type ApplicationKey } from '@linea/db'
import { generateApplicationKey } from '../auth/api-key.util'
import type { CreateApplicationKeyDto } from './dto/create-application-key.dto'

export type PublicApplicationKey = Omit<ApplicationKey, 'hashedKey'>

function toPublicApplicationKey(
  applicationKey: ApplicationKey,
): PublicApplicationKey {
  return {
    id: applicationKey.id,
    workspaceId: applicationKey.workspaceId,
    applicationId: applicationKey.applicationId,
    name: applicationKey.name,
    scopes: applicationKey.scopes,
    keyPrefix: applicationKey.keyPrefix,
    lastUsedAt: applicationKey.lastUsedAt,
    createdAt: applicationKey.createdAt,
    revokedAt: applicationKey.revokedAt,
  }
}

@Injectable()
export class ApplicationKeysService {
  async create(
    workspaceId: string,
    applicationId: string,
    actorUserId: string,
    input: CreateApplicationKeyDto,
  ): Promise<PublicApplicationKey & { rawKey: string }> {
    const { rawKey, hashedKey, keyPrefix } = generateApplicationKey()
    const result = await repositories.applicationKey.createApplicationKey(
      db,
      {
        workspaceId,
        applicationId,
        name: input.name,
        scopes: input.scopes,
        hashedKey,
        keyPrefix,
      },
      { userId: actorUserId },
    )
    if (result.outcome === 'application_not_found') {
      throw new NotFoundException('Application not found')
    }
    return { ...toPublicApplicationKey(result.applicationKey), rawKey }
  }

  async list(
    workspaceId: string,
    applicationId: string,
  ): Promise<PublicApplicationKey[]> {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    const applicationKeys =
      await repositories.applicationKey.listApplicationKeys(
        db,
        workspaceId,
        applicationId,
      )
    return applicationKeys.map(toPublicApplicationKey)
  }

  async rotate(
    workspaceId: string,
    applicationId: string,
    id: string,
    actorUserId: string,
  ): Promise<PublicApplicationKey & { rawKey: string }> {
    const { rawKey, hashedKey, keyPrefix } = generateApplicationKey()
    const applicationKey =
      await repositories.applicationKey.rotateApplicationKey(
        db,
        workspaceId,
        applicationId,
        id,
        { hashedKey, keyPrefix },
        { userId: actorUserId },
      )
    if (!applicationKey)
      throw new NotFoundException('Application key not found')
    return { ...toPublicApplicationKey(applicationKey), rawKey }
  }

  async revoke(
    workspaceId: string,
    applicationId: string,
    id: string,
    actorUserId: string,
  ): Promise<PublicApplicationKey> {
    const applicationKey =
      await repositories.applicationKey.revokeApplicationKey(
        db,
        workspaceId,
        applicationId,
        id,
        { userId: actorUserId },
      )
    if (!applicationKey)
      throw new NotFoundException('Application key not found')
    return toPublicApplicationKey(applicationKey)
  }
}
