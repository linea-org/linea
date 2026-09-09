import { z } from "zod"

export const eventTypes = [
  "execution.completed",
  "execution.failed",
  "approval_request.created",
  "approval_request.decided",
  "approval_request.cancelled",
  "action_intent.executed",
  "action_intent.failed",
  "connection.revoked",
] as const

export const eventTypeSchema = z.enum(eventTypes)

export type EventType = z.infer<typeof eventTypeSchema>
