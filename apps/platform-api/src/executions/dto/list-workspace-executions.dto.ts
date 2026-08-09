import { z } from 'zod'
import { executionCursorSchema } from './execution-cursor'

export const listWorkspaceExecutionsSchema = z.object({
  status: z
    .enum(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  trigger: z.enum(['manual', 'schedule', 'webhook', 'api']).optional(),
  // Re-applying .optional() after the cursor transform: ZodEffects doesn't inherit the
  // optional-key marker from the ZodOptional it wraps, so without this, z.object would
  // require the `cursor` key to be present (even if its value is undefined).
  cursor: executionCursorSchema.optional(),
})

export type ListWorkspaceExecutionsDto = z.infer<
  typeof listWorkspaceExecutionsSchema
>
