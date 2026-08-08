import { z } from 'zod'

export const listWorkspaceExecutionsSchema = z.object({
  status: z
    .enum(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  trigger: z.enum(['manual', 'schedule', 'webhook', 'api']).optional(),
})

export type ListWorkspaceExecutionsDto = z.infer<
  typeof listWorkspaceExecutionsSchema
>
