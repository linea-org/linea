import { z } from 'zod'

export const conversationAnalysisQuerySchema = z.object({
  findingId: z.string().uuid().optional(),
})

export type ConversationAnalysisQueryDto = z.infer<
  typeof conversationAnalysisQuerySchema
>
