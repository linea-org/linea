import { z } from "zod"

export const environmentKeyScopes = [
  "subjects:provision",
  "executions:read",
  "executions:start",
  "executions:cancel",
  "conversations:read",
  "conversations:write",
  "events:read",
  "audit:read",
  "webhooks:read",
] as const

export const environmentKeyScopeSchema = z.enum(environmentKeyScopes)

export type EnvironmentKeyScope = z.infer<typeof environmentKeyScopeSchema>
