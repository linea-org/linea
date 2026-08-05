import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthenticatedRequest } from './workspace-auth.guard'

export const CurrentWorkspaceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.workspaceId
  },
)
