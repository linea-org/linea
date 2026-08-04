import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const branchInputSchema = z.object({
  value: z.unknown(),
})

// Matched against an outgoing edge's `condition` by the walker.
const branchOutputSchema = z.object({
  branch: z.string(),
})

export const branchNode: NodeDefinition<
  z.infer<typeof branchInputSchema>,
  z.infer<typeof branchOutputSchema>
> = {
  id: "branch",
  inputSchema: branchInputSchema,
  outputSchema: branchOutputSchema,
  needsSandbox: false,
}
