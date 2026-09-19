import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"
import { retryPolicySchema } from "../retry-policy.js"

const connectorInputSchema = z.object({
  operation: z.string().min(1),
  retryPolicy: retryPolicySchema.optional(),
})

export const connectorRequestSchema = z
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
