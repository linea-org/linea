import type { Connection, Edge } from "@xyflow/react"
import type { WorkflowBuilderNodeData } from "./graph-conversion"

/**
 * Mirrors packages/runtime's validateGraphStructure so the canvas refuses, at connection time,
 * what the backend would otherwise only catch when saving a version: a self-loop, a second
 * incoming edge to a node (every node but the entry allows exactly one), a branch edge with no
 * condition or a condition reused from another of that branch's edges, more than one outgoing
 * edge from a non-branch node (this repo's node types are a linear chain except branch), and a
 * cycle.
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

  const targetHasIncoming = edges.some((edge) => edge.target === target)
  if (targetHasIncoming) return false

  const sourceType = nodeTypeById.get(source)
  if (sourceType === "end") return false
  const outgoingFromSource = edges.filter((edge) => edge.source === source)
  if (sourceType === "branch") {
    if (!sourceHandle) return false
    if (outgoingFromSource.some((edge) => edge.sourceHandle === sourceHandle)) {
      return false
    }
  } else if (outgoingFromSource.length > 0) {
    return false
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
