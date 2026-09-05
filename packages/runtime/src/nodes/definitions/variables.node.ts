import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const variablesInputSchema = z.unknown()

const variablesOutputSchema = z.object({
  // set
  variables: z.record(z.string(), z.unknown()).optional(),
  // get
  found: z.boolean().optional(),
  value: z.unknown().optional(),
})

export const variablesNode: NodeDefinition<
  z.infer<typeof variablesInputSchema>,
  z.infer<typeof variablesOutputSchema>
> = {
  id: "variables",
  inputSchema: variablesInputSchema,
  outputSchema: variablesOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Variables",
    description:
      "Declare or update workflow-scoped state that any downstream node can read via a Get, not just the immediate predecessor.",
    category: "data",
    icon: "variable",
    fields: [
      {
        key: "operation",
        label: "Operation",
        widget: "select",
        options: [
          { label: "Set", value: "set" },
          { label: "Get", value: "get" },
        ],
      },
      {
        key: "entries",
        label: "Values to set",
        widget: "key-value",
        description:
          "Merged into the existing workflow variables — keys not listed here are left untouched. Literal values only; chain a Transform node first to write a value from this node's input.",
        showIf: { key: "operation", equals: "set" },
      },
      {
        key: "key",
        label: "Key",
        widget: "text",
        description: "Leave empty to get every variable as one object.",
        showIf: { key: "operation", equals: "get" },
      },
    ],
    summaryField: "operation",
  },
}
