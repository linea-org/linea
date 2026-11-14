import { SetMetadata } from '@nestjs/common'
import type { WorkspaceKeyScope } from '@linea/protocol/resources'

export const WORKSPACE_KEY_SCOPES_KEY = 'workspace_key_scopes'

/** Opens a WorkspaceAuthGuard route to workspace API keys holding every listed scope. Without it the route is session-only. */
export const RequireWorkspaceKeyScopes = (...scopes: WorkspaceKeyScope[]) =>
  SetMetadata(WORKSPACE_KEY_SCOPES_KEY, scopes)
