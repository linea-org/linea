import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const waitInputSchema = z.unknown()

const waitOutputSchema = z.object({
  resumedAt: z.string(),
})

export const waitNode: NodeDefinition<
  z.infer<typeof waitInputSchema>,
  z.infer<typeof waitOutputSchema>
> = {
  id: "wait",
  inputSchema: waitInputSchema,
  outputSchema: waitOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Wait",
    description:
      "Pause the workflow for a fixed duration or until a specific time, then resume automatically.",
    category: "logic",
    icon: "clock",
    fields: [
      {
        key: "mode",
        label: "Wait for",
        widget: "select",
        options: [
          { label: "A duration", value: "duration" },
          { label: "Until a specific time", value: "until" },
        ],
      },
      {
        key: "amount",
        label: "Amount",
        widget: "text",
        description: "A positive number.",
        showIf: { key: "mode", equals: "duration" },
      },
      {
        key: "unit",
        label: "Unit",
        widget: "select",
        options: [
          { label: "Seconds", value: "seconds" },
          { label: "Minutes", value: "minutes" },
          { label: "Hours", value: "hours" },
          { label: "Days", value: "days" },
        ],
        showIf: { key: "mode", equals: "duration" },
      },
      {
        key: "until",
        label: "Until (ISO 8601)",
        widget: "text",
        description: "e.g. 2026-09-01T09:00:00.000Z",
        showIf: { key: "mode", equals: "until" },
      },
    ],
    summaryField: "mode",
  },
}
