import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { db, repositories, type ApiKey } from '@linea/db'
import type { Request } from 'express'
import { hashApiKey } from './api-key.util'

export type AuthenticatedRequest = Request & {
  workspaceId: string
  apiKeyPurpose?: ApiKey['purpose']
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
    const sessionUserId = request.session?.user?.id
    if (activeOrganizationId && sessionUserId) {
      // A session's activeOrganizationId can outlive the user's actual membership (removed from
      // the org after the session was issued) — verified live here, at the trust boundary every
      // route relies on, rather than in each caller that reads request.workspaceId downstream.
      const role = await repositories.organization.getMemberRole(
        db,
        activeOrganizationId,
        sessionUserId,
      )
      if (role) {
        request.workspaceId = activeOrganizationId
        request.apiKeyPurpose = undefined
        return true
      }
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
    request.apiKeyPurpose = apiKey.purpose
    // A request can carry both a stale session (e.g. a removed member whose session cookie
    // still resolves to this org) and a valid API key — the API key is what actually authorized
    // this request, so the stale session must not linger for OptionalUserId to read downstream
    // and misattribute the action to a user who isn't a member of the workspace the key granted.
    request.session = null
    return true
  }
}
