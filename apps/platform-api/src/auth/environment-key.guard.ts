import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { EnvironmentKeyScope } from '@linea/protocol/resources'
import type { Request } from 'express'
import { hashApiKey } from './api-key.util'
import { publicError } from './public-error'

export type EnvironmentPrincipal = {
  keyId: string
  workspaceId: string
  environmentId: string
  scopes: EnvironmentKeyScope[]
}

export type EnvironmentAuthenticatedRequest = Request & {
  environmentPrincipal?: EnvironmentPrincipal
}

@Injectable()
export class EnvironmentKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<EnvironmentAuthenticatedRequest>()
    const authorization = request.headers.authorization
    const rawKey = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined
    if (!rawKey) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Environment authentication failed',
        ),
      )
    }
    const environmentKey =
      await repositories.environmentKey.authenticateEnvironmentKey(
        db,
        hashApiKey(rawKey),
      )
    if (!environmentKey) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Environment authentication failed',
        ),
      )
    }
    await repositories.environmentKey.recordEnvironmentKeyActivity(
      db,
      environmentKey,
      'environment_key.used',
      { environmentId: environmentKey.environmentId },
    )
    request.environmentPrincipal = {
      keyId: environmentKey.id,
      workspaceId: environmentKey.workspaceId,
      environmentId: environmentKey.environmentId,
      scopes: environmentKey.scopes,
    }
    return true
  }
}
