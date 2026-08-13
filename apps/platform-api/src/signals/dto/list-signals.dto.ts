import { z } from 'zod'

export const listSignalsSchema = z.object({
  workflowId: z.string().optional(),
})

export type ListSignalsDto = z.infer<typeof listSignalsSchema>
