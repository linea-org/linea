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
}
