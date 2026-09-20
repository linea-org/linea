import { z } from "zod"

export const applicationKeyScopes = [
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

export const applicationKeyScopeSchema = z.enum(applicationKeyScopes)

export type ApplicationKeyScope = z.infer<typeof applicationKeyScopeSchema>
