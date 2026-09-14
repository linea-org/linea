import { z } from "zod"
import { jsonValueSchema } from "../shared/json-value"
import { timestampSchema } from "../shared/timestamp"

function utf8ByteLength(value: string): number {
  let length = 0
  for (let index = 0; index < value.length; index += 1) {
    const point = value.codePointAt(index)
    if (point === undefined) throw new Error("Invalid string index")
    if (point <= 0x7f) length += 1
    else if (point <= 0x7ff) length += 2
    else if (point <= 0xffff) length += 3
    else {
      length += 4
      index += 1
    }
  }
  return length
}

export const conversationEnvironmentSchema = z.enum(["dev", "production"])
export const conversationStatusSchema = z.enum(["active", "closed"])
export const publicRuntimeIdSchema = z.string().uuid()
export const conversationMetadataSchema = z
  .record(z.string().trim().min(1).max(64), jsonValueSchema)
  .refine((value) => utf8ByteLength(JSON.stringify(value)) <= 8192, {
    message: "Conversation metadata cannot exceed 8 KiB",
  })

export const createApplicationConversationSchema = z.strictObject({
  workflowId: publicRuntimeIdSchema,
  externalSubjectId: publicRuntimeIdSchema,
  externalThreadKey: z.string().trim().min(1).max(256).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  metadata: conversationMetadataSchema.default({}),
})

export const createEndUserConversationSchema = z.strictObject({
  workflowId: publicRuntimeIdSchema,
  externalThreadKey: z.string().trim().min(1).max(256).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  metadata: conversationMetadataSchema.default({}),
})

export const conversationSchema = z.strictObject({
  id: publicRuntimeIdSchema,
  applicationId: publicRuntimeIdSchema,
  workflowId: publicRuntimeIdSchema,
  externalSubjectId: publicRuntimeIdSchema,
  externalThreadKey: z.string().nullable(),
  title: z.string().nullable(),
  metadata: conversationMetadataSchema,
  environment: conversationEnvironmentSchema,
  status: conversationStatusSchema,
  lastActivityAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const createMessageSchema = z.strictObject({
  content: z
    .string()
    .min(1)
    .refine((value) => utf8ByteLength(value) <= 16 * 1024, {
      message: "Message content cannot exceed 16 KiB",
    }),
})

export const messageSchema = z.strictObject({
  id: z.string().uuid(),
  conversationId: publicRuntimeIdSchema,
  clientMessageId: z.string().nullable(),
  executionId: z.string().uuid().nullable(),
  respondsToMessageId: z.string().uuid().nullable(),
  sequence: z.number().int().positive(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: timestampSchema,
})

export type CreateApplicationConversation = z.infer<
  typeof createApplicationConversationSchema
>
export type CreateEndUserConversation = z.infer<
  typeof createEndUserConversationSchema
>
export type ConversationProjection = z.infer<typeof conversationSchema>
export type CreateMessage = z.infer<typeof createMessageSchema>
export type MessageProjection = z.infer<typeof messageSchema>
