import { z } from 'zod'

export const sendConversationMessageSchema = z.object({
  externalSubjectId: z.string().min(1),
  message: z.string().min(1),
})

export type SendConversationMessageDto = z.infer<
  typeof sendConversationMessageSchema
>
