import { z } from 'zod'
import { registry } from '@linea/ai'
import { agentDefinitionSchema } from '@linea/runtime'
import {
  connectorOperationRegistry,
  registeredReadOperation,
  registeredSideEffectOperation,
} from '@linea/connectors'

export const createAgentSchema = z.strictObject({
  applicationId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  description: z.string().max(2000).optional(),
})

export const updateAgentSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    'At least one field is required',
  )

export const createAgentVersionSchema = z.strictObject({
  definition: agentDefinitionSchema.superRefine((definition, context) => {
    if (!Object.hasOwn(registry, definition.model))
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Unknown model',
      })
    definition.tools.forEach((tool, index) => {
      if (
        !registeredReadOperation(connectorOperationRegistry, tool.operation) &&
        !registeredSideEffectOperation(
          connectorOperationRegistry,
          tool.operation,
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['tools', index, 'operation'],
          message: 'Unknown Connector Operation',
        })
    })
  }),
  agentContractRevisionId: z.uuid(),
})

export type CreateAgentDto = z.infer<typeof createAgentSchema>
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>
export type CreateAgentVersionDto = z.infer<typeof createAgentVersionSchema>
