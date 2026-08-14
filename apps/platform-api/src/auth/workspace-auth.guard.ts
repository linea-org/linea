import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { Request } from 'express'
import { hashApiKey } from './api-key.util'

export type AuthenticatedRequest = Request & {
  workspaceId: string
  session?: {
    session?: { activeOrganizationId?: string }
    user?: { id: string }
  } | null
}

/** Resolves the current workspace from either a Better Auth session (browser) or an `Authorization: Bearer <api-key>` header (external callers). Apply alongside @OptionalAuth() so the global session guard doesn't reject a request before this one runs. */
@Injectable()
export class WorkspaceAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    const activeOrganizationId = request.session?.session?.activeOrganizationId
    if (activeOrganizationId) {
      request.workspaceId = activeOrganizationId
      return true
    }

    const authorization = request.headers.authorization
    const rawKey = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined
    if (!rawKey) {
      throw new UnauthorizedException('Session or API key required')
    }

    const apiKey = await repositories.apiKey.getApiKeyByHash(
      db,
      hashApiKey(rawKey),
    )
    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid API key')
    }

    await repositories.apiKey.touchApiKeyLastUsed(db, apiKey.id)
    request.workspaceId = apiKey.workspaceId
    return true
  }
}
