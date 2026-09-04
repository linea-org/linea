import { z } from 'zod'

export const listEvalRunsSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export type ListEvalRunsDto = z.infer<typeof listEvalRunsSchema>
