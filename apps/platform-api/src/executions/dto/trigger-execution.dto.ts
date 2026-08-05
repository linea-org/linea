import { z } from 'zod'

export const triggerExecutionSchema = z.object({
  triggerPayload: z.record(z.string(), z.unknown()).optional(),
})

export type TriggerExecutionDto = z.infer<typeof triggerExecutionSchema>
