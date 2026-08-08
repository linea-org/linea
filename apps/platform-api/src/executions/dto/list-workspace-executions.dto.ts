import { z } from 'zod'

// `${createdAt.toISOString()}_${id}` — neither an ISO timestamp nor a uuid contains an
// underscore, so splitting on the first one unambiguously recovers both parts.
const cursorSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined
    const separatorIndex = value.indexOf('_')
    const createdAt =
      separatorIndex === -1
        ? undefined
        : new Date(value.slice(0, separatorIndex))
    const id =
      separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1)
    if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
      ctx.addIssue({ code: 'custom', message: 'Invalid cursor' })
      return z.NEVER
    }
    return { createdAt, id }
  })
  // Re-applied after transform: ZodEffects doesn't inherit the optional-key
  // marker from the ZodOptional it wraps, so without this, z.object would
  // require the `cursor` key to be present (even if its value is undefined).
  .optional()

export const listWorkspaceExecutionsSchema = z.object({
  status: z
    .enum(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  trigger: z.enum(['manual', 'schedule', 'webhook', 'api']).optional(),
  cursor: cursorSchema,
})

export type ListWorkspaceExecutionsDto = z.infer<
  typeof listWorkspaceExecutionsSchema
>
