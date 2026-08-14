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
  ui: {
    label: "Transform",
    description: "Pick a value out of the upstream step's output by path.",
    category: "data",
    icon: "braces",
    // "input" isn't a config field — it's the runtime value from the upstream node.
    fields: [
      { key: "expression", label: "Path (e.g. body.items)", widget: "text" },
    ],
    summaryField: "expression",
  },
}
