import { z } from "zod"

export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)

export const applicationIdSchema = identifierSchema
export const workflowIdSchema = identifierSchema
export const workflowContractIdSchema = identifierSchema
export const externalSubjectIdSchema = identifierSchema
export const conversationIdSchema = identifierSchema
export const executionIdSchema = identifierSchema
export const approvalRequestIdSchema = identifierSchema
export const decisionIdSchema = identifierSchema
export const actionIntentIdSchema = identifierSchema
export const connectionIdSchema = identifierSchema
export const eventIdSchema = identifierSchema

export type Identifier = z.infer<typeof identifierSchema>
export type ApplicationId = z.infer<typeof applicationIdSchema>
export type WorkflowId = z.infer<typeof workflowIdSchema>
export type WorkflowContractId = z.infer<typeof workflowContractIdSchema>
export type ExternalSubjectId = z.infer<typeof externalSubjectIdSchema>
export type ConversationId = z.infer<typeof conversationIdSchema>
export type ExecutionId = z.infer<typeof executionIdSchema>
export type ApprovalRequestId = z.infer<typeof approvalRequestIdSchema>
export type DecisionId = z.infer<typeof decisionIdSchema>
export type ActionIntentId = z.infer<typeof actionIntentIdSchema>
export type ConnectionId = z.infer<typeof connectionIdSchema>
export type EventId = z.infer<typeof eventIdSchema>
