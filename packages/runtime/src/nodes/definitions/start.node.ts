import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const startInputSchema = z.unknown()
const startOutputSchema = z.unknown()

export const startNode: NodeDefinition = {
  id: "start",
  inputSchema: startInputSchema,
  outputSchema: startOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Start",
    description: "The workflow always begins here.",
    category: "trigger",
    icon: "play",
    fields: [
      {
        key: "triggerType",
        label: "Trigger",
        widget: "select",
        options: [
          { label: "Manual", value: "manual" },
          { label: "Schedule", value: "schedule" },
          { label: "Webhook", value: "webhook" },
          { label: "API", value: "api" },
        ],
      },
      {
        key: "cron",
        label: "Cron expression",
        widget: "text",
        description: 'Standard 5-field cron, e.g. "0 9 * * 1-5".',
        showIf: { key: "triggerType", equals: "schedule" },
      },
      {
        key: "timezone",
        label: "Timezone",
        widget: "text",
        description: 'IANA timezone, e.g. "America/New_York".',
        showIf: { key: "triggerType", equals: "schedule" },
      },
    ],
  },
}
