import {
  applyDecorators,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { isFlagEnabled, type FlagKey } from '@linealabs/flags'
import type { AuthenticatedRequest } from '../auth/workspace-auth.guard'

const REQUIRE_FLAG_KEY = 'requireFeatureFlag'

/** A disabled feature answers 404, so it looks absent rather than forbidden. */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.getAllAndOverride<FlagKey>(REQUIRE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const { workspaceId } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>()
    if (!workspaceId) {
      throw new Error('RequireFlag needs WorkspaceAuthGuard to run first')
    }
    if (!(await isFlagEnabled(flag, workspaceId))) {
      throw new NotFoundException()
    }
    return true
  }
}

export const RequireFlag = (flag: FlagKey) =>
  applyDecorators(
    SetMetadata(REQUIRE_FLAG_KEY, flag),
    UseGuards(FeatureFlagGuard),
  )
