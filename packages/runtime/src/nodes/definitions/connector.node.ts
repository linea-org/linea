import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const connectorInputSchema = z
  .object({
    connectionId: z.string().uuid(),
    input: z.unknown(),
  })
  .strict()

const connectorOutputSchema = z.unknown()

export const connectorNode: NodeDefinition<
  z.infer<typeof connectorInputSchema>,
  z.infer<typeof connectorOutputSchema>
> = {
  id: "connector",
  inputSchema: connectorInputSchema,
  outputSchema: connectorOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Connector read",
    description: "Read from a connected provider account.",
    category: "integration",
    icon: "globe",
    fields: [
      {
        key: "operation",
        label: "Operation",
        widget: "text",
        description: "Registered Connector Operation identifier.",
      },
    ],
    summaryField: "operation",
  },
}
