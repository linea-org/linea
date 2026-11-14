import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { EnvironmentKeyScope } from '@linea/protocol/resources'
import type { Request } from 'express'
import { enforceRequestRateLimits } from '../common/request-rate-limit'
import { hashApiKey } from './api-key.util'
import { publicError } from './public-error'

const ENVIRONMENT_KEY_RATE_LIMITS = {
  read: { key: 600, workspace: 3000 },
  write: { key: 120, workspace: 600 },
}

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
    const access =
      request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write'
    await enforceRequestRateLimits([
      {
        scope: `environment-key:${access}:key:${environmentKey.id}`,
        limit: ENVIRONMENT_KEY_RATE_LIMITS[access].key,
      },
      {
        scope: `environment-key:${access}:workspace:${environmentKey.workspaceId}`,
        limit: ENVIRONMENT_KEY_RATE_LIMITS[access].workspace,
      },
    ])
    await repositories.environmentKey.recordEnvironmentKeyActivity(
      db,
      environmentKey,
      'environment_key.used',
      { environmentId: environmentKey.environmentId },
      new Date(),
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
