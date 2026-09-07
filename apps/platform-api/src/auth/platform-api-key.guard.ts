import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import type { AuthenticatedRequest } from './workspace-auth.guard'

@Injectable()
export class PlatformApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (request.apiKeyPurpose !== 'platform') {
      throw new UnauthorizedException('Platform API key required')
    }
    return true
  }
}
