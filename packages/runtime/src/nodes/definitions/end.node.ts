import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const endInputSchema = z.unknown()
const endOutputSchema = z.unknown()

export const endNode: NodeDefinition = {
  id: "end",
  inputSchema: endInputSchema,
  outputSchema: endOutputSchema,
  needsSandbox: false,
  ui: {
    label: "End",
    description: "The workflow finishes here.",
    category: "trigger",
    icon: "circle-stop",
    fields: [],
  },
}
