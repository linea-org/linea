import { z } from 'zod'

export const putAgentBindingSchema = z.strictObject({
  agentVersionId: z.uuid(),
  agentContractRevisionId: z.uuid(),
  enabled: z.boolean(),
})

export type PutAgentBindingDto = z.infer<typeof putAgentBindingSchema>
