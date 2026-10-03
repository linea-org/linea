import { z } from "zod"
import {
  environmentIdSchema,
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

export const environmentWorkflowBindingSchema = z.strictObject({
  id: identifierSchema,
  environmentId: environmentIdSchema,
  applicationId: identifierSchema,
  workflowVersionId: identifierSchema,
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
export type EnvironmentWorkflowBinding = z.infer<
  typeof environmentWorkflowBindingSchema
>
