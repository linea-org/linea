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
  ui: {
    label: "Branch",
    description: "Route to a different next step based on the input value.",
    category: "logic",
    icon: "git-branch",
    // "value" is the runtime input, not config — the handler reads config.cases/defaultBranch instead.
    fields: [
      { key: "cases", label: "Cases", widget: "code" },
      { key: "defaultBranch", label: "Default branch", widget: "text" },
    ],
  },
}
