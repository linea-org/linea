import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const transformInputSchema = z.object({
  expression: z.string(),
  input: z.unknown(),
})

const transformOutputSchema = z.object({
  output: z.unknown(),
})

export const transformNode: NodeDefinition<
  z.infer<typeof transformInputSchema>,
  z.infer<typeof transformOutputSchema>
> = {
  id: "transform",
  inputSchema: transformInputSchema,
  outputSchema: transformOutputSchema,
  needsSandbox: false,
}
