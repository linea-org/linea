import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common'
import type { AuthenticatedRequest } from './workspace-auth.guard'

/** Notifications are per-user, so an API-key-authenticated request (no session user) can't use these routes — matches the existing "management needs a real session" precedent for API keys and secrets. */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const userId = request.session?.user?.id
    if (!userId) {
      throw new UnauthorizedException('A signed-in session is required')
    }
    return userId
  },
)
