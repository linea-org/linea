import { z } from "zod"
import { identifierSchema } from "../shared/identifier"

export const resourceTypeSchema = z.enum([
  "application",
  "workflow_contract",
  "external_subject",
  "conversation",
  "execution",
  "approval_request",
  "decision",
  "action_intent",
  "connection",
])

export const resourceProjectionSchema = z.strictObject({
  id: identifierSchema,
})

export const resourceReferenceSchema = resourceProjectionSchema.extend({
  type: resourceTypeSchema,
})

export type ResourceType = z.infer<typeof resourceTypeSchema>
export type ResourceProjection = z.infer<typeof resourceProjectionSchema>
export type ResourceReference = z.infer<typeof resourceReferenceSchema>
