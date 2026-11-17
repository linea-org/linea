import type { WorkflowGraph } from "@linealabs/runtime/browser"

import type { JsonValue } from "@/lib/executions-api"

export type Proposal = {
  id: string
  title: string | null
  graph: WorkflowGraph
  // The JSON-safe form of `graph`, sent back to the assistant as context for the next turn.
  raw: Record<string, JsonValue>
}
