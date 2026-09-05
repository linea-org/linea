import type { WorkflowNode } from "@linea/runtime"

export function resolveNodeModel(node: WorkflowNode): string | undefined {
  if (
    node.type !== "ai" &&
    node.type !== "extract" &&
    node.type !== "evaluator"
  ) {
    return undefined
  }
  return typeof node.config.model === "string" ? node.config.model : undefined
}
