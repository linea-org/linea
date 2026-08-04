import type { WorkflowGraph } from "./schema.js"

export class WorkflowGraphError extends Error {}

/** Validates what the zod schema can't: real edges, exactly one incoming edge per non-entry node, no cycles. */
export function validateGraphStructure(graph: WorkflowGraph): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.id))

  if (!nodeIds.has(graph.entryNodeId)) {
    throw new WorkflowGraphError(
      `entryNodeId "${graph.entryNodeId}" is not a node in this graph`
    )
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new WorkflowGraphError(
        `Edge references unknown node "${edge.from}"`
      )
    }
    if (!nodeIds.has(edge.to)) {
      throw new WorkflowGraphError(`Edge references unknown node "${edge.to}"`)
    }
  }

  const incomingCount = new Map<string, number>()
  for (const edge of graph.edges) {
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1)
  }
  for (const node of graph.nodes) {
    const count = incomingCount.get(node.id) ?? 0
    if (node.id === graph.entryNodeId) {
      if (count !== 0) {
        throw new WorkflowGraphError(
          `Entry node "${node.id}" cannot have incoming edges`
        )
      }
    } else if (count !== 1) {
      throw new WorkflowGraphError(
        `Node "${node.id}" must have exactly one incoming edge, has ${count}`
      )
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return
    if (visiting.has(nodeId)) {
      throw new WorkflowGraphError(`Cycle detected at node "${nodeId}"`)
    }
    visiting.add(nodeId)
    for (const edge of graph.edges.filter((e) => e.from === nodeId)) {
      visit(edge.to)
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
  }
  visit(graph.entryNodeId)
}
