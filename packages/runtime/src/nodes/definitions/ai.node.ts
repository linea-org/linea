import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const aiInputSchema = z.object({
  prompt: z.string(),
  model: z.string(),
  systemPrompt: z.string().optional(),
})

const aiOutputSchema = z.object({
  text: z.string(),
  tokensInput: z.number(),
  tokensOutput: z.number(),
})

export const aiNode: NodeDefinition<
  z.infer<typeof aiInputSchema>,
  z.infer<typeof aiOutputSchema>
> = {
  id: "ai",
  inputSchema: aiInputSchema,
  outputSchema: aiOutputSchema,
  needsSandbox: false,
}
