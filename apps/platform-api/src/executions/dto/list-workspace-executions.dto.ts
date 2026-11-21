import { z } from 'zod'
import { executionCursorSchema } from './execution-cursor'

export const listWorkspaceExecutionsSchema = z.object({
  status: z
    .enum(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  trigger: z.enum(['manual', 'schedule', 'webhook', 'api']).optional(),
  // Re-applying .optional(): ZodEffects doesn't inherit the optional-key marker from the ZodOptional it wraps, so without this z.object would require the `cursor` key present even with an undefined value.
  cursor: executionCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export type ListWorkspaceExecutionsDto = z.infer<
  typeof listWorkspaceExecutionsSchema
>
