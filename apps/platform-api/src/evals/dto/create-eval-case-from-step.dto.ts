import { z } from 'zod'

export const createEvalCaseFromStepSchema = z.object({
  stepId: z.string(),
})

export type CreateEvalCaseFromStepDto = z.infer<
  typeof createEvalCaseFromStepSchema
>
