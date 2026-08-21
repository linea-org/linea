import type { Connection, Edge } from "@xyflow/react"
import type { WorkflowBuilderNodeData } from "./graph-conversion"

/**
 * Mirrors packages/runtime's validateGraphStructure so the canvas refuses, at connection time,
 * what the backend would otherwise only catch when saving a version: a self-loop, a second
 * incoming edge to a node that isn't a merge node (a merge node allows exactly two — the two
 * paths it combines), a third incoming edge to a merge node, a branch edge with no condition or
 * a condition reused from another of that branch's edges, and a cycle. A non-branch, non-merge-
 * target node may have any number of unconditioned outgoing edges — all are followed at runtime
 * (fan-out) — this repo's node types are a linear chain except branch (which conditionally routes
 * to one of several) and any node feeding a merge node (which fans out to more than one).
 */
export function isValidConnection(
  connection: Connection | Edge,
  edges: Edge[],
  nodeTypeById: Map<string, WorkflowBuilderNodeData["nodeType"]>,
  entryNodeId: string
): boolean {
  const { source, target, sourceHandle } = connection
  if (!source || !target) return false
  if (source === target) return false
  if (target === entryNodeId) return false

  const targetType = nodeTypeById.get(target)
  const incomingToTarget = edges.filter((edge) => edge.target === target)
  const maxIncoming = targetType === "merge" ? 2 : 1
  if (incomingToTarget.length >= maxIncoming) return false

  const sourceType = nodeTypeById.get(source)
  if (sourceType === "end") return false
  if (sourceType === "branch") {
    if (!sourceHandle) return false
    const outgoingFromSource = edges.filter((edge) => edge.source === source)
    if (outgoingFromSource.some((edge) => edge.sourceHandle === sourceHandle)) {
      return false
    }
  }

  return !createsCycle(source, target, edges)
}

/** True if `target` can already reach `source` — adding source->target would close a loop. */
function createsCycle(source: string, target: string, edges: Edge[]): boolean {
  const visited = new Set<string>()
  const stack = [target]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) continue
    if (current === source) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target)
    }
  }
  return false
}
