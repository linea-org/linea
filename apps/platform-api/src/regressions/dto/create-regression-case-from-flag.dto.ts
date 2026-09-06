import { z } from 'zod'

export const createRegressionCaseFromFlagSchema = z.object({
  flagId: z.string(),
})

export type CreateRegressionCaseFromFlagDto = z.infer<
  typeof createRegressionCaseFromFlagSchema
>
