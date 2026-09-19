import { z } from "zod"
import { paginationQuerySchema } from "../shared/pagination"
import { timestampSchema } from "../shared/timestamp"
import { publicRuntimeIdSchema } from "./conversation"

export const pendingActionIntentSchema = z.strictObject({
  id: publicRuntimeIdSchema,
  executionId: publicRuntimeIdSchema,
  connectionId: publicRuntimeIdSchema,
  operation: z.string().min(1).max(200),
  display: z.strictObject({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    details: z.record(z.string(), z.string()).optional(),
  }),
  approvalRequest: z.strictObject({
    id: publicRuntimeIdSchema,
    expiresAt: timestampSchema,
  }),
  createdAt: timestampSchema,
})

export const listPendingActionIntentsQuerySchema = paginationQuerySchema

export type PendingActionIntent = z.infer<typeof pendingActionIntentSchema>
export type ListPendingActionIntentsQuery = z.infer<
  typeof listPendingActionIntentsQuerySchema
>
