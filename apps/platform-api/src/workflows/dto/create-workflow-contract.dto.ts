import { jsonSchemaDocumentSchema } from '@linea/protocol/resources'
import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'

const jsonSchemaValidator = new Ajv2020({ strict: true })

const validatedJsonSchemaDocument = jsonSchemaDocumentSchema.refine(
  (schema) => jsonSchemaValidator.validateSchema(schema),
  'Invalid JSON Schema',
)

export const createWorkflowContractSchema = z.strictObject({
  inputSchema: validatedJsonSchemaDocument,
  outputSchema: validatedJsonSchemaDocument,
})

export type CreateWorkflowContractDto = z.infer<
  typeof createWorkflowContractSchema
>
