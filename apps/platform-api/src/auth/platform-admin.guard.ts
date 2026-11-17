import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { db, repositories } from '@linealabs/db'
import type { AuthenticatedRequest } from './workspace-auth.guard'

/** Company staff only, whatever workspace they are in: a signed-in session whose user is in platform_admins. API keys never qualify. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const userId = request.session?.user?.id
    if (!userId) {
      throw new UnauthorizedException('A signed-in session is required')
    }
    const admin = await repositories.templateModeration.isPlatformAdmin(
      db,
      userId,
    )
    if (!admin) throw new ForbiddenException('Requires platform admin access')
    return true
  }
}
