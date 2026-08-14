import { SetMetadata } from '@nestjs/common'

export type WorkspaceRole = 'member' | 'admin' | 'owner'

export const REQUIRE_ROLE_KEY = 'requireWorkspaceRole'

/** Minimum workspace role a route needs, checked by WorkspaceRoleGuard. Absent = open to any member (WorkspaceAuthGuard already confirmed membership). */
export const RequireRole = (role: WorkspaceRole) =>
  SetMetadata(REQUIRE_ROLE_KEY, role)
