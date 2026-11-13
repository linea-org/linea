import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { db, repositories, type ApiKey } from '@linea/db'
import type { WorkspaceKeyScope } from '@linea/protocol/resources'
import type { Request } from 'express'
import { hashApiKey } from './api-key.util'
import { WORKSPACE_KEY_SCOPES_KEY } from './require-workspace-key-scopes.decorator'

export type AuthenticatedRequest = Request & {
  workspaceId: string
  session?: {
    session?: { activeOrganizationId?: string; createdAt?: Date }
    user?: { id: string }
  } | null
}

const KEY_MINTING_ROLES = ['admin', 'owner']

/** Resolves the current workspace from either a Better Auth session (browser) or an `Authorization: Bearer <api-key>` header (external callers). Apply alongside @OptionalAuth() so the global session guard doesn't reject a request before this one runs. */
@Injectable()
export class WorkspaceAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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
    if (apiKey.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('API key has expired')
    }
    await this.assertCreatorCanStillMintKeys(apiKey)
    this.assertKeyHasRouteScopes(context, apiKey.scopes)
    await repositories.apiKey.touchApiKeyLastUsed(db, apiKey.id)
    request.workspaceId = apiKey.workspaceId
    // A request can carry both a stale session (e.g. a removed member whose session cookie
    // still resolves to this org) and a valid API key — the API key is what actually authorized
    // this request, so the stale session must not linger for OptionalUserId to read downstream
    // and misattribute the action to a user who isn't a member of the workspace the key granted.
    request.session = null
    return true
  }

  // Removal revokes a creator's keys outright; this also stops them while the creator is demoted below admin.
  private async assertCreatorCanStillMintKeys(apiKey: ApiKey): Promise<void> {
    if (!apiKey.createdByUserId) return
    const role = await repositories.organization.getMemberRole(
      db,
      apiKey.workspaceId,
      apiKey.createdByUserId,
    )
    if (!role || !KEY_MINTING_ROLES.includes(role)) {
      throw new UnauthorizedException(
        "API key's creator is no longer a workspace admin",
      )
    }
  }

  private assertKeyHasRouteScopes(
    context: ExecutionContext,
    grantedScopes: WorkspaceKeyScope[],
  ): void {
    const requiredScopes = this.reflector.getAllAndOverride<
      WorkspaceKeyScope[] | undefined
    >(WORKSPACE_KEY_SCOPES_KEY, [context.getHandler(), context.getClass()])
    if (!requiredScopes) {
      throw new ForbiddenException(
        "Requires a signed-in session — workspace API keys can't be used here",
      )
    }
    const missingScopes = requiredScopes.filter(
      (scope) => !grantedScopes.includes(scope),
    )
    if (missingScopes.length > 0) {
      throw new ForbiddenException(
        `API key is missing required scope: ${missingScopes.join(', ')}`,
      )
    }
  }
}
