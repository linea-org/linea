import { z } from 'zod'
import { workflowGraphSchema } from '@linea/runtime'

export const sendChatMessageSchema = z.object({
  graph: workflowGraphSchema,
  conversationId: z.string().optional(),
  message: z.string().min(1),
  // Chat Preview's "test as" knob — an arbitrary customer-supplied id, mirroring what a real
  // trigger-payload field would carry in production. Optional and omitted from triggerPayload
  // entirely when unset, so existing workflows/tests are unaffected.
  externalSubjectId: z.string().optional(),
})

export type SendChatMessageDto = z.infer<typeof sendChatMessageSchema>
