import { z } from 'zod'

export const replayStepSchema = z.object({
  overrideConfig: z.record(z.string(), z.unknown()).optional(),
})

export type ReplayStepDto = z.infer<typeof replayStepSchema>
