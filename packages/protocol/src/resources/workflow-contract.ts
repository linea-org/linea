import { z } from "zod"
import {
  applicationIdSchema,
  identifierSchema,
  workflowContractIdSchema,
  workflowIdSchema,
} from "../shared/identifier"
import { jsonValueSchema } from "../shared/json-value"
import { timestampSchema } from "../shared/timestamp"

export const jsonSchemaDocumentSchema = z.record(z.string(), jsonValueSchema)

export const workflowContractRevisionSchema = z.strictObject({
  id: workflowContractIdSchema,
  workflowId: workflowIdSchema,
  revision: z.number().int().positive(),
  inputSchema: jsonSchemaDocumentSchema,
  outputSchema: jsonSchemaDocumentSchema,
  createdAt: timestampSchema,
})

export const applicationWorkflowBindingSchema = z.strictObject({
  id: identifierSchema,
  applicationId: applicationIdSchema,
  workflowId: workflowIdSchema,
  workflowContractRevisionId: workflowContractIdSchema,
  allowBackendStart: z.boolean(),
  allowEndUserStart: z.boolean(),
  enabled: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export type JsonSchemaDocument = z.infer<typeof jsonSchemaDocumentSchema>
export type WorkflowContractRevision = z.infer<
  typeof workflowContractRevisionSchema
>
export type ApplicationWorkflowBinding = z.infer<
  typeof applicationWorkflowBindingSchema
>
