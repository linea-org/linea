import { z } from 'zod'

export const startApplicationExecutionSchema = z.strictObject({
  workflowId: z.uuid(),
  triggerPayload: z.record(z.string(), z.unknown()),
})

export type StartApplicationExecutionDto = z.infer<
  typeof startApplicationExecutionSchema
>
