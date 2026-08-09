import { z } from 'zod'
import { executionCursorSchema } from './execution-cursor'

export const countNewWorkspaceExecutionsSchema = z.object({
  status: z
    .enum(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  trigger: z.enum(['manual', 'schedule', 'webhook', 'api']).optional(),
  since: executionCursorSchema,
})

export type CountNewWorkspaceExecutionsDto = z.infer<
  typeof countNewWorkspaceExecutionsSchema
>
