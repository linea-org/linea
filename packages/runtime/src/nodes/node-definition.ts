import type { z } from "zod"

export type NodeUIFieldWidget =
  | "text"
  | "textarea"
  | "select"
  | "code"
  | "key-value"
  | "agent"
  | "mcp-servers"

export type NodeUIField = {
  key: string
  label: string
  widget: NodeUIFieldWidget
  options?: { label: string; value: string }[]
  description?: string
  optional?: boolean
  // Takes references (ADR 0034): "value" keeps the type of a lone one, "url" percent-encodes.
  references?: { as: "text" | "value" | "url"; secrets?: true }
  // Field only shows when another field in the same config currently equals this value (or one of these values).
  showIf?: { key: string; equals: string | string[] }
}

export type NodeUICategory = "trigger" | "ai" | "integration" | "logic" | "data"

// Icon is a lucide-react name string, not a component, so this package stays free of a frontend dependency.
export type NodeUIMeta = {
  label: string
  description: string
  category: NodeUICategory
  icon: string
  fields: NodeUIField[]
  // Which config field's value the canvas shows as the node's one-line summary.
  summaryField?: string
  // Output keys by operation, for a node whose operations don't all return the same ones.
  outputsByOperation?: Record<string, string[]>
}

export type NodeDefinition<TInput = unknown, TOutput = unknown> = {
  id: string
  inputSchema: z.ZodType<TInput>
  outputSchema: z.ZodType<TOutput>
  needsSandbox: boolean
  ui: NodeUIMeta
}
