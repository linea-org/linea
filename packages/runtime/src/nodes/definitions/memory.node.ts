import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const memoryInputSchema = z.unknown()

const memoryOutputSchema = z.object({
  // write
  key: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
  // read
  found: z.boolean().optional(),
  value: z.unknown().optional(),
})

export const memoryNode: NodeDefinition<
  z.infer<typeof memoryInputSchema>,
  z.infer<typeof memoryOutputSchema>
> = {
  id: "memory",
  inputSchema: memoryInputSchema,
  outputSchema: memoryOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Memory",
    description:
      "Read or write a keyed value, scoped to an external subject (e.g. your customer's own end-user) and a namespace.",
    category: "data",
    icon: "brain",
    fields: [
      {
        key: "operation",
        label: "Operation",
        widget: "select",
        options: [
          { label: "Write", value: "write" },
          { label: "Read", value: "read" },
        ],
      },
      {
        key: "subjectPath",
        label: "Subject path",
        widget: "text",
        description:
          "Dot-path into this node's input identifying whose memory this is (e.g. your app's own user id) — not a Linea user.",
      },
      {
        key: "namespace",
        label: "Namespace",
        widget: "text",
        description:
          "Leave empty to isolate memory to this workflow. Set the same value on Memory nodes in other workflows to share.",
      },
      {
        key: "key",
        label: "Key",
        widget: "text",
      },
      {
        key: "valuePath",
        label: "Value path",
        widget: "text",
        description:
          "Dot-path into this node's input for the value to store. Leave empty to store the entire input.",
        showIf: { key: "operation", equals: "write" },
      },
      {
        key: "ttlSeconds",
        label: "Expires after (seconds)",
        widget: "text",
        description: "Leave empty to keep this value indefinitely.",
        showIf: { key: "operation", equals: "write" },
      },
    ],
    summaryField: "key",
  },
}
