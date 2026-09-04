import { z } from 'zod'

export const triggerEvalRunSchema = z.object({
  workflowVersionId: z.string().optional(),
})

export type TriggerEvalRunDto = z.infer<typeof triggerEvalRunSchema>
