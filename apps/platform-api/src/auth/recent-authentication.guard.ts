import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import {
  RECENT_AUTHENTICATION_REQUIRED,
  RECENT_AUTHENTICATION_WINDOW_SECONDS,
} from '@linea/auth/session-policy'
import type { AuthenticatedRequest } from './workspace-auth.guard'

/** A sign-in or an authenticator-code check within the window both count as recent. */
export function hasRecentAuthentication(
  session: { createdAt?: Date; stepUpAt?: Date | null } | undefined,
  now: Date,
): boolean {
  const times = [session?.createdAt, session?.stepUpAt]
    .filter((time): time is Date => time instanceof Date)
    .map((time) => time.getTime())
  if (times.length === 0) return false
  return (
    now.getTime() - Math.max(...times) <
    RECENT_AUTHENTICATION_WINDOW_SECONDS * 1000
  )
}

@Injectable()
export class RecentAuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!hasRecentAuthentication(request.session?.session, new Date())) {
      throw new ForbiddenException({
        statusCode: 403,
        code: RECENT_AUTHENTICATION_REQUIRED,
        message: 'Confirm it’s you to continue',
      })
    }
    return true
  }
}
