import { z } from 'zod'
import { compileContractSchema } from '@linealabs/protocol/json-schema'
import { jsonSchemaDocumentSchema } from '@linealabs/protocol/resources'

const contractSchema = jsonSchemaDocumentSchema.superRefine(
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

export const createAgentContractSchema = z.strictObject({
  inputSchema: contractSchema,
  outputSchema: contractSchema,
})

export type CreateAgentContractDto = z.infer<typeof createAgentContractSchema>
