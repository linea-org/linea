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
import type { ApplicationKeyScope } from '@linea/protocol/resources'
import type { ApplicationAuthenticatedRequest } from './application-key.guard'
import { publicError } from './public-error'
import { APPLICATION_SCOPES_KEY } from './require-application-scopes.decorator'

@Injectable()
export class ApplicationScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ApplicationAuthenticatedRequest>()
    const principal = request.applicationPrincipal
    if (!principal) {
      throw new UnauthorizedException(
        publicError(
          'authentication_failed',
          'Application authentication failed',
        ),
      )
    }
    const requestedApplicationId = request.params.applicationId
    if (
      requestedApplicationId &&
      requestedApplicationId !== principal.applicationId
    ) {
      await repositories.applicationKey.recordApplicationKeyActivity(
        db,
        {
          id: principal.keyId,
          workspaceId: principal.workspaceId,
          applicationId: principal.applicationId,
        },
        'application_key.cross_application_access_denied',
        { requestedApplicationId },
      )
      throw new NotFoundException(
        publicError('resource_not_found', 'Resource not found'),
      )
    }
    const requiredScopes =
      this.reflector.getAllAndOverride<ApplicationKeyScope[]>(
        APPLICATION_SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? []
    if (requiredScopes.some((scope) => !principal.scopes.includes(scope))) {
      await repositories.applicationKey.recordApplicationKeyActivity(
        db,
        {
          id: principal.keyId,
          workspaceId: principal.workspaceId,
          applicationId: principal.applicationId,
        },
        'application_key.scope_denied',
        { requiredScopes },
      )
      throw new ForbiddenException(
        publicError('scope_denied', 'Application key scope denied'),
      )
    }
    return true
  }
}
