import { z } from "zod"

export const workspaceKeyScopes = [
  "workflows:read",
  "workflows:write",
  "workflows:publish",
  "applications:read",
  "executions:read",
  "executions:start",
  "signals:read",
  "signals:write",
  "regressions:read",
  "regressions:write",
  "audit:read",
] as const

export const workspaceKeyScopeSchema = z.enum(workspaceKeyScopes)

export type WorkspaceKeyScope = z.infer<typeof workspaceKeyScopeSchema>
