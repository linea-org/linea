import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { ApplicationKeyScope } from '@linea/protocol/resources'
import type { Request } from 'express'
import { hashApiKey } from './api-key.util'
import { publicError } from './public-error'

export type ApplicationPrincipal = {
  keyId: string
  workspaceId: string
  applicationId: string
  scopes: ApplicationKeyScope[]
}

export type ApplicationAuthenticatedRequest = Request & {
  applicationPrincipal?: ApplicationPrincipal
}

@Injectable()
export class ApplicationKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ApplicationAuthenticatedRequest>()
    const authorization = request.headers.authorization
    const rawKey = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined
    if (!rawKey) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Application authentication failed',
        ),
      )
    }
    const applicationKey =
      await repositories.applicationKey.authenticateApplicationKey(
        db,
        hashApiKey(rawKey),
      )
    if (!applicationKey) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Application authentication failed',
        ),
      )
    }
    await repositories.applicationKey.recordApplicationKeyActivity(
      db,
      applicationKey,
      'application_key.used',
      { applicationId: applicationKey.applicationId },
    )
    request.applicationPrincipal = {
      keyId: applicationKey.id,
      workspaceId: applicationKey.workspaceId,
      applicationId: applicationKey.applicationId,
      scopes: applicationKey.scopes,
    }
    return true
  }
}
