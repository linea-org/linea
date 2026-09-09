import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { RECENT_AUTHENTICATION_WINDOW_SECONDS } from '@linea/auth/session-policy'
import type { AuthenticatedRequest } from './workspace-auth.guard'

export function hasRecentAuthentication(
  createdAt: Date | undefined,
  now: Date,
): boolean {
  if (!createdAt) return false
  return (
    now.getTime() - createdAt.getTime() <
    RECENT_AUTHENTICATION_WINDOW_SECONDS * 1000
  )
}

@Injectable()
export class RecentAuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const createdAt = request.session?.session?.createdAt
    if (!hasRecentAuthentication(createdAt, new Date())) {
      throw new ForbiddenException('Recent authentication is required')
    }
    return true
  }
}
