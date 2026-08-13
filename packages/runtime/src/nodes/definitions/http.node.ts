import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const httpInputSchema = z.object({
  url: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
})

const httpOutputSchema = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()),
  body: z.unknown(),
})

export const httpNode: NodeDefinition<
  z.infer<typeof httpInputSchema>,
  z.infer<typeof httpOutputSchema>
> = {
  id: "http",
  inputSchema: httpInputSchema,
  outputSchema: httpOutputSchema,
  needsSandbox: false,
  ui: {
    label: "HTTP request",
    description: "Call an external HTTP API.",
    category: "integration",
    icon: "globe",
    fields: [
      { key: "url", label: "URL", widget: "text" },
      {
        key: "method",
        label: "Method",
        widget: "select",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
          { label: "PUT", value: "PUT" },
          { label: "PATCH", value: "PATCH" },
          { label: "DELETE", value: "DELETE" },
        ],
      },
      { key: "headers", label: "Headers", widget: "key-value" },
      { key: "body", label: "Body", widget: "code" },
    ],
    summaryField: "url",
  },
}
