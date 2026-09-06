import { z } from 'zod'

export const createRegressionCaseFromStepSchema = z.object({
  stepId: z.string(),
})

export type CreateRegressionCaseFromStepDto = z.infer<
  typeof createRegressionCaseFromStepSchema
>
