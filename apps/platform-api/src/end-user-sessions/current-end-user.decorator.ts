import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type {
  EndUserAuthenticatedRequest,
  EndUserPrincipal,
} from './end-user-session.guard'

export const CurrentEndUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): EndUserPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<EndUserAuthenticatedRequest>()
    if (!request.endUserPrincipal) {
      throw new Error('End-user principal missing after authentication')
    }
    return request.endUserPrincipal
  },
)
