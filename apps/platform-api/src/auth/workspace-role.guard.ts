import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { db, repositories } from '@linea/db'
import { REQUIRE_ROLE_KEY, type WorkspaceRole } from './require-role.decorator'
import type { AuthenticatedRequest } from './workspace-auth.guard'

const ROLE_RANK: Record<WorkspaceRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
}

/** Runs after WorkspaceAuthGuard, which has already set request.workspaceId and confirmed membership or a valid API key. */
@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.get<WorkspaceRole | undefined>(
        REQUIRE_ROLE_KEY,
        context.getHandler(),
      ) ??
      this.reflector.get<WorkspaceRole | undefined>(
        REQUIRE_ROLE_KEY,
        context.getClass(),
      )
    if (!required) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const userId = request.session?.user?.id
    // API-key requests have no per-user role — the key itself is an admin-issued, workspace-scoped credential, so it's already privileged.
    if (!userId) return true

    // Falls back to the session directly so this guard also works on routes (like ApiKeysController) that don't run WorkspaceAuthGuard.
    const workspaceId =
      request.workspaceId ?? request.session?.session?.activeOrganizationId
    if (!workspaceId) return true

    const role = await repositories.organization.getMemberRole(
      db,
      workspaceId,
      userId,
    )
    if (!role || ROLE_RANK[role as WorkspaceRole] < ROLE_RANK[required]) {
      throw new ForbiddenException(`Requires ${required} role or higher`)
    }
    return true
  }
}
