import { z } from 'zod'

export const listRegressionRunsSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export type ListRegressionRunsDto = z.infer<typeof listRegressionRunsSchema>
