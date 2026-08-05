import { z } from 'zod'
import { slugSchema } from './create-workflow.dto'

export const updateWorkflowSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one field is required',
  })

export type UpdateWorkflowDto = z.infer<typeof updateWorkflowSchema>
