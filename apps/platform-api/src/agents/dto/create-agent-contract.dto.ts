import { z } from 'zod'
import Ajv2020 from 'ajv/dist/2020.js'
import { jsonSchemaDocumentSchema } from '@linea/protocol/resources'

const validator = new Ajv2020({ strict: true, addUsedSchema: false })

const contractSchema = jsonSchemaDocumentSchema.superRefine(
  (schema, context) => {
    try {
      validator.compile(schema)
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
