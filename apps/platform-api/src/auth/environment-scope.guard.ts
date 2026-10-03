import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { db, repositories } from '@linea/db'
import type { EnvironmentKeyScope } from '@linea/protocol/resources'
import type { EnvironmentAuthenticatedRequest } from './environment-key.guard'
import { publicError } from './public-error'
import { ENVIRONMENT_SCOPES_KEY } from './require-environment-scopes.decorator'

@Injectable()
export class EnvironmentScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<EnvironmentAuthenticatedRequest>()
    const principal = request.environmentPrincipal
    if (!principal) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Environment authentication failed',
        ),
      )
    }
    const requestedEnvironmentId = request.params.environmentId
    if (
      requestedEnvironmentId &&
      requestedEnvironmentId !== principal.environmentId
    ) {
      await repositories.environmentKey.recordEnvironmentKeyActivity(
        db,
        {
          id: principal.keyId,
          workspaceId: principal.workspaceId,
          environmentId: principal.environmentId,
        },
        'environment_key.cross_environment_access_denied',
        { requestedEnvironmentId },
      )
      throw new NotFoundException(
        publicError('resource_not_found', 'Resource not found'),
      )
    }
    const requiredScopes =
      this.reflector.getAllAndOverride<EnvironmentKeyScope[]>(
        ENVIRONMENT_SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? []
    if (requiredScopes.some((scope) => !principal.scopes.includes(scope))) {
      await repositories.environmentKey.recordEnvironmentKeyActivity(
        db,
        {
          id: principal.keyId,
          workspaceId: principal.workspaceId,
          environmentId: principal.environmentId,
        },
        'environment_key.scope_denied',
        { requiredScopes },
      )
      throw new ForbiddenException(
        publicError('scope_denied', 'Environment key scope denied'),
      )
    }
    return true
  }
}
