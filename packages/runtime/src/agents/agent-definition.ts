import { z } from "zod"

export const agentDefinitionSchema = z.strictObject({
  version: z.literal(1),
  instructions: z.string().trim().min(1),
  model: z.string().trim().min(1),
  tools: z
    .array(
      z.strictObject({
        name: z.string().regex(/^[a-zA-Z]\w*$/),
        operation: z.string().trim().min(1),
      })
    )
    .refine(
      (tools) => new Set(tools.map((tool) => tool.name)).size === tools.length,
      "Tool names must be unique"
    ),
  maxIterations: z.number().int().positive(),
})

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>
