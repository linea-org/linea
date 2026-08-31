import { z } from 'zod'

export const createEvalCaseFromFlagSchema = z.object({
  flagId: z.string(),
})

export type CreateEvalCaseFromFlagDto = z.infer<
  typeof createEvalCaseFromFlagSchema
>
