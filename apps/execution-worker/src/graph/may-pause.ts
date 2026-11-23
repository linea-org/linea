import { connectorOperationRegistry } from "@linealabs/connectors"
import type { WorkflowNode } from "@linealabs/runtime"

const operations = new Map<string, { classification: string }>(
  Object.entries(connectorOperationRegistry)
)

/** Whether a step can leave its Execution waiting; see ADR 0028 for why these run alone. */
export function mayPause(node: WorkflowNode): boolean {
  switch (node.type) {
    case "approval":
    case "wait":
    case "agent":
      return true
    case "connector":
      return (
        operations.get(String(node.config.operation))?.classification !== "read"
      )
    default:
      return false
  }
}
