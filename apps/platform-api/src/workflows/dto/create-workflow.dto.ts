import { z } from 'zod'

export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'must be lowercase alphanumeric with hyphens',
  )

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
})

export type CreateWorkflowDto = z.infer<typeof createWorkflowSchema>
