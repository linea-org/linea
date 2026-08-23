import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthenticatedRequest } from './workspace-auth.guard'

/** Unlike CurrentUserId, never throws — an API-key-authenticated request has no session user, and
 * that's a legitimate way to call these routes, not an error. Used to attribute an execution to
 * the workspace member who ran it themselves, when there is one. */
export const OptionalUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.session?.user?.id
  },
)
