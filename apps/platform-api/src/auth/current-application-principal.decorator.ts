import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common'
import type {
  ApplicationAuthenticatedRequest,
  ApplicationPrincipal,
} from './application-key.guard'
import { publicError } from './public-error'

export const CurrentApplicationPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApplicationPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<ApplicationAuthenticatedRequest>()
    if (!request.applicationPrincipal) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Application authentication failed',
        ),
      )
    }
    return request.applicationPrincipal
  },
)
