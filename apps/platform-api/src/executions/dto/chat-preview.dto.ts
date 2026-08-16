import { z } from 'zod'
import { workflowGraphSchema } from '@linea/runtime'

export const sendChatMessageSchema = z.object({
  graph: workflowGraphSchema,
  conversationId: z.string().optional(),
  message: z.string().min(1),
})

export type SendChatMessageDto = z.infer<typeof sendChatMessageSchema>
