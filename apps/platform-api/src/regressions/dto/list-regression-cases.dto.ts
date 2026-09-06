import { z } from 'zod'

export const listRegressionCasesSchema = z.object({
  // z.coerce.boolean() treats any non-empty string as true, so "?includeArchived=false" would be truthy.
  includeArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
})

export type ListRegressionCasesDto = z.infer<typeof listRegressionCasesSchema>
