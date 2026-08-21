import type { WorkflowGraph } from "./schema.js"

export class WorkflowGraphError extends Error {}

// Mirrors execution.repository.ts's RESUME_EVENT_NODE_ID — duplicated rather than imported so this package doesn't pick up @linea/db as a dependency just for one string constant.
const RESERVED_NODE_IDS = new Set(["__resumed__"])

/** Rejects reserved node ids. Deliberately NOT part of validateGraphStructure, which also runs on every execution of an already-published graph — a graph published before this reservation existed must keep executing, not fail retroactively. Call only where a graph is newly authored. */
export function assertNoReservedNodeIds(graph: WorkflowGraph): void {
  for (const node of graph.nodes) {
    if (RESERVED_NODE_IDS.has(node.id)) {
      throw new WorkflowGraphError(`Node id "${node.id}" is reserved`)
    }
  }
}

/** Validates structural invariants the zod schema can't express: ids, edges, reachability, cycles, branch routing. */
export function validateGraphStructure(graph: WorkflowGraph): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  if (nodeIds.size !== graph.nodes.length) {
    throw new WorkflowGraphError("Node ids must be unique")
  }

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
    } else {
      // Only a merge node fans in — every other node still takes exactly one predecessor.
      const expected = node.type === "merge" ? 2 : 1
      if (count !== expected) {
        throw new WorkflowGraphError(
          `Node "${node.id}" must have exactly ${expected} incoming edge${expected === 1 ? "" : "s"}, has ${count}`
        )
      }
    }
    if (
      node.type === "end" &&
      graph.edges.some((edge) => edge.from === node.id)
    ) {
      throw new WorkflowGraphError(
        `End node "${node.id}" cannot have outgoing edges`
      )
    }
  }

  // A condition on a non-branch node's edge would be silently ignored by the walker (it isn't
  // matched against anything) — reject it here rather than let it quietly do nothing.
  for (const node of graph.nodes) {
    if (node.type === "branch") continue
    const stray = graph.edges.find(
      (edge) => edge.from === node.id && edge.condition !== undefined
    )
    if (stray) {
      throw new WorkflowGraphError(
        `Node "${node.id}" is not a branch node but has a conditioned outgoing edge to "${stray.to}"`
      )
    }
  }

  // The walker matches on condition, so a missing or duplicate one is unreachable code.
  for (const node of graph.nodes) {
    if (node.type !== "branch") continue
    const conditions = graph.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => edge.condition)

    if (conditions.some((condition) => condition === undefined)) {
      throw new WorkflowGraphError(
        `Branch node "${node.id}" has an outgoing edge with no condition`
      )
    }
    if (new Set(conditions).size !== conditions.length) {
      throw new WorkflowGraphError(
        `Branch node "${node.id}" has two outgoing edges with the same condition`
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

  // The DFS above only walks what's reachable — a disconnected cyclic island never gets visited.
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      throw new WorkflowGraphError(
        `Node "${node.id}" is not reachable from the entry node`
      )
    }
  }
}
