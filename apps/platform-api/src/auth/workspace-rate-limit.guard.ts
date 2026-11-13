import {
  applyDecorators,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { enforceRequestRateLimits } from '../common/request-rate-limit'
import { hashApiKey } from './api-key.util'
import type { AuthenticatedRequest } from './workspace-auth.guard'

export const WORKSPACE_RATE_LIMITS = {
  start: { actor: 60, workspace: 300 },
  diagnostic: { actor: 10, workspace: 30 },
}

type WorkspaceRateLimitClass = keyof typeof WORKSPACE_RATE_LIMITS

const WORKSPACE_RATE_LIMIT_KEY = 'workspaceRateLimit'

/** Must follow WorkspaceAuthGuard: budgets are keyed on the workspace and the session user or API key it authenticated. */
export function WorkspaceRateLimit(limitClass: WorkspaceRateLimitClass) {
  return applyDecorators(
    SetMetadata(WORKSPACE_RATE_LIMIT_KEY, limitClass),
    UseGuards(WorkspaceRateLimitGuard),
  )
}

@Injectable()
export class WorkspaceRateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limitClass = this.reflector.get<WorkspaceRateLimitClass | undefined>(
      WORKSPACE_RATE_LIMIT_KEY,
      context.getHandler(),
    )
    if (!limitClass) {
      throw new Error('WorkspaceRateLimitGuard requires @WorkspaceRateLimit')
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const limits = WORKSPACE_RATE_LIMITS[limitClass]
    await enforceRequestRateLimits([
      {
        scope: `workspace:${limitClass}:actor:${this.actor(request)}`,
        limit: limits.actor,
      },
      {
        scope: `workspace:${limitClass}:workspace:${request.workspaceId}`,
        limit: limits.workspace,
      },
    ])
    return true
  }

  private actor(request: AuthenticatedRequest): string {
    const userId = request.session?.user?.id
    if (userId) return `user:${userId}`
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      throw new Error('WorkspaceRateLimitGuard ran before WorkspaceAuthGuard')
    }
    return `api-key:${hashApiKey(authorization.slice('Bearer '.length))}`
  }
}
