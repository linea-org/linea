import { z } from 'zod'

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  content: z.string().max(100_000),
})

const MAX_ATTACHMENT_CHARS = 200_000

export const assistantMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  /** Continues a saved chat; a new chat is started when omitted. */
  conversationId: z.uuid().optional(),
  /** The message this one follows; null starts a new branch at the top. The latest message when omitted. */
  parentMessageId: z.uuid().nullable().optional(),
  graph: z
    .record(z.string(), z.unknown())
    .refine((graph) => JSON.stringify(graph).length <= 100_000, {
      message: 'Graph is too large',
    })
    .optional(),
  /** A model for this message; the workspace's default model when omitted. */
  model: z.string().min(1).max(100).optional(),
  tools: z.object({ web: z.boolean() }).default({ web: false }),
  /** Text files attached to this message. */
  attachments: z
    .array(attachmentSchema)
    .max(5)
    .refine(
      (files) =>
        files.reduce((total, file) => total + file.content.length, 0) <=
        MAX_ATTACHMENT_CHARS,
      { message: 'Attachments are too large' },
    )
    .default([]),
})

export type AssistantMessageDto = z.infer<typeof assistantMessageSchema>
