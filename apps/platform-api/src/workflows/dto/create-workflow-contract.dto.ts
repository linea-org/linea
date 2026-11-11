import { jsonSchemaDocumentSchema } from '@linea/protocol/resources'
import { compileContractSchema } from '@linea/protocol/json-schema'
import { z } from 'zod'

const validatedJsonSchemaDocument = jsonSchemaDocumentSchema.superRefine(
  (schema, context) => {
    try {
      compileContractSchema(schema)
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid JSON Schema',
      })
    }
  },
)

export const createWorkflowContractSchema = z.strictObject({
  inputSchema: validatedJsonSchemaDocument,
  outputSchema: validatedJsonSchemaDocument,
})

export type CreateWorkflowContractDto = z.infer<
  typeof createWorkflowContractSchema
>
