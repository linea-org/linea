import { connectorOperationRegistry } from "@linealabs/connectors"
import type { WorkflowNode } from "@linealabs/runtime"

const operations = new Map<string, { classification: string }>(
  Object.entries(connectorOperationRegistry)
)

/** Whether a step can ask for a decision; at most one of these may be waiting (ADR 0031). */
export function needsConsent(node: WorkflowNode): boolean {
  if (node.type === "approval") return true
  return (
    node.type === "connector" &&
    operations.get(String(node.config.operation))?.classification !== "read"
  )
}
