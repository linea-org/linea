import { z } from 'zod'

export const putWorkflowBindingSchema = z.strictObject({
  workflowContractRevisionId: z.uuid(),
  allowBackendStart: z.boolean(),
  allowEndUserStart: z.boolean(),
  enabled: z.boolean(),
})

export type PutWorkflowBindingDto = z.infer<typeof putWorkflowBindingSchema>
