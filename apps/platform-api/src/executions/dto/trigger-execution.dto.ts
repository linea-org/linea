import { z } from 'zod'

export const triggerExecutionSchema = z.object({
  triggerPayload: z.record(z.string(), z.unknown()).optional(),
  // "draft" is reserved for Linea's own builder testing surfaces and can't be set via this
  // endpoint — a real caller (the SDK, or a direct API call) declares dev vs production itself,
  // since the same published workflow can be called from either of a customer's own deployments.
  environment: z.enum(['dev', 'production']).optional(),
})

export type TriggerExecutionDto = z.infer<typeof triggerExecutionSchema>
