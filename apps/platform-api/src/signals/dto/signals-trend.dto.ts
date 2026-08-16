import { z } from 'zod'

export const signalsTrendSchema = z.object({
  workflowId: z.string().optional(),
})

export type SignalsTrendDto = z.infer<typeof signalsTrendSchema>
