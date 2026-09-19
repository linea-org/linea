import { z } from "zod"

export const approvalDisplaySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  details: z.record(z.string(), z.string()).optional(),
})

export const approvalRequestSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  nodeId: z.string(),
  audience: z.enum(["workspace", "external_subject"]),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
  display: approvalDisplaySchema,
  approverEmails: z.array(z.string()).nullable(),
  timeoutAt: z.string().nullable(),
  respondedBy: z.string().nullable(),
  respondedAt: z.string().nullable(),
  timedOut: z.boolean(),
  createdAt: z.string(),
})
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>

export const approvalRequestsSchema = z.array(approvalRequestSchema)
