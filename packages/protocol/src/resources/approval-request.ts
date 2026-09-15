import { z } from "zod"
import { timestampSchema } from "../shared/timestamp"
import { paginationQuerySchema } from "../shared/pagination"
import { publicRuntimeIdSchema } from "./conversation"

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

export const approvalDecisionSchema = z.strictObject({
  id: publicRuntimeIdSchema,
  outcome: z.enum(["approved", "rejected"]),
  reason: z.enum(["human", "timeout"]),
  comment: z.string().nullable(),
  decidedAt: timestampSchema,
})

export const approvalRequestSchema = z.strictObject({
  id: publicRuntimeIdSchema,
  executionId: publicRuntimeIdSchema,
  conversationId: publicRuntimeIdSchema.nullable(),
  status: z.enum(["pending", "decided", "cancelled"]),
  version: z.number().int().positive(),
  display: z.strictObject({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    details: z.record(z.string(), z.string()).optional(),
  }),
  requestedAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
  decision: approvalDecisionSchema.nullable(),
})

export const listApprovalRequestsQuerySchema = paginationQuerySchema.extend({
  status: z.literal("pending").default("pending"),
  conversationId: publicRuntimeIdSchema.optional(),
})

export const decideApprovalRequestSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  comment: z
    .string()
    .refine((value) => utf8ByteLength(value) <= 2048)
    .optional(),
})

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>
export type ListApprovalRequestsQuery = z.infer<
  typeof listApprovalRequestsQuerySchema
>
export type DecideApprovalRequest = z.infer<typeof decideApprovalRequestSchema>
