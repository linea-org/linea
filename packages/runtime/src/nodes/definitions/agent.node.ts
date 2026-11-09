import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const agentInputSchema = z.object({ agentId: z.uuid() })

export const agentRequestSchema = z.record(z.string(), z.unknown())

const agentOutputSchema = z.unknown()

export const agentNode: NodeDefinition<
  z.infer<typeof agentInputSchema>,
  z.infer<typeof agentOutputSchema>
> = {
  id: "agent",
  inputSchema: agentInputSchema,
  outputSchema: agentOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Run Agent",
    description:
      "Run a deployed Agent from this Application and use its Contract-valid result.",
    category: "ai",
    icon: "bot",
    fields: [
      {
        key: "agentId",
        label: "Agent",
        widget: "text",
        description:
          "An Agent in this Workflow's Application, deployed and enabled in the run's Environment.",
      },
    ],
    summaryField: "agentId",
  },
}
