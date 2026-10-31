import { z } from "zod"
import { agentDefinitionSchema } from "@linea/runtime/browser"
import { jsonSchemaDocumentSchema } from "@linea/protocol/resources"

export const agentSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  archivedAt: z.string().nullable(),
})

export const agentContractSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  revision: z.number().int().positive(),
  inputSchema: jsonSchemaDocumentSchema,
  outputSchema: jsonSchemaDocumentSchema,
})

export const agentVersionSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  version: z.number().int().positive(),
  definition: agentDefinitionSchema,
  agentContractRevisionId: z.uuid(),
  publishedAt: z.string().nullable(),
})

export const agentBindingSchema = z.object({
  id: z.uuid(),
  environmentId: z.uuid(),
  agentId: z.uuid(),
  agentVersionId: z.uuid(),
  agentContractRevisionId: z.uuid(),
  enabled: z.boolean(),
})

export const agentCatalogSchema = z.object({
  models: z.array(z.string()),
  operations: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      classification: z.enum(["read", "side_effect"]),
    })
  ),
})

export const createAgentInputSchema = z.object({
  applicationId: z.uuid(),
  name: z.string().trim().min(1, "Enter a name").max(200),
  slug: z
    .string()
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens"
    ),
  description: z.string().max(2000),
})

export const createAgentVersionInputSchema = z.object({
  agentId: z.uuid(),
  agentContractRevisionId: z.uuid("Select a Contract revision"),
  definition: agentDefinitionSchema,
})

export type AgentSummary = z.infer<typeof agentSchema>
export type AgentContract = z.infer<typeof agentContractSchema>
export type AgentVersion = z.infer<typeof agentVersionSchema>
export type AgentBinding = z.infer<typeof agentBindingSchema>
export type AgentCatalog = z.infer<typeof agentCatalogSchema>
