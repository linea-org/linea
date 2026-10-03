import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common'
import type {
  EnvironmentAuthenticatedRequest,
  EnvironmentPrincipal,
} from './environment-key.guard'
import { publicError } from './public-error'

export const CurrentEnvironmentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): EnvironmentPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<EnvironmentAuthenticatedRequest>()
    if (!request.environmentPrincipal) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Environment authentication failed',
        ),
      )
    }
    return request.environmentPrincipal
  },
)
