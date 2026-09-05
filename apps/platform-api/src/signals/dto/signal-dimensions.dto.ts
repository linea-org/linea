import { z } from 'zod'

export const signalDimensionsSchema = z.object({
  environment: z.enum(['production', 'dev', 'draft']).default('production'),
})

export type SignalDimensionsDto = z.infer<typeof signalDimensionsSchema>
