import { z } from 'zod'

export const triggerRegressionRunSchema = z.object({
  workflowVersionId: z.string().optional(),
})

export type TriggerRegressionRunDto = z.infer<typeof triggerRegressionRunSchema>
