import { retryPolicySchema } from "../nodes/retry-policy.js"
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
      // Two edges from the same source isn't two real inputs — the walker would resolve the
      // merge's input by reading that one predecessor's output twice, not combining two values.
      if (node.type === "merge") {
        const sources = graph.edges
          .filter((edge) => edge.to === node.id)
          .map((edge) => edge.from)
        if (new Set(sources).size !== sources.length) {
          throw new WorkflowGraphError(
            `Merge node "${node.id}" has two incoming edges from the same source "${sources[0]}"`
          )
        }
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

  // Runs here (not just in the builder's config panel) so a graph that was saved before this
  // field existed, or edited outside the UI, is rejected on every path that reaches the
  // interpreter — publish, trigger/test-run, and the worker's own pre-execution check — instead
  // of silently having its retries disabled deep inside interpreter.service.ts.
  for (const node of graph.nodes) {
    if (node.config.retryPolicy === undefined) continue
    const result = retryPolicySchema.safeParse(node.config.retryPolicy)
    if (!result.success) {
      throw new WorkflowGraphError(
        `Node "${node.id}" has an invalid retryPolicy: ${result.error.message}`
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

  // A merge whose two predecessors trace back through opposite arms of the same branch can never
  // fire — the walker only activates a branch's taken edge, so the untaken arm's node never
  // completes and the merge waits forever, silently skipping it and everything downstream while
  // still reporting the execution as succeeded. Detectable here because every node but merge has
  // exactly one predecessor (checked above), so "which branch conditions does reaching this node
  // require" is well-defined by walking backward, recombining at each merge along the way.
  type BranchChoices = Map<string, string>
  const choicesCache = new Map<string, BranchChoices>()
  const withEdge = (
    choices: BranchChoices,
    edge: WorkflowGraph["edges"][number]
  ): BranchChoices => {
    const fromNode = graph.nodes.find((n) => n.id === edge.from)
    if (fromNode?.type !== "branch" || edge.condition === undefined) {
      return choices
    }
    const next = new Map(choices)
    next.set(edge.from, edge.condition)
    return next
  }
  const combineChoices = (
    a: BranchChoices,
    b: BranchChoices,
    mergeNodeId: string
  ): BranchChoices => {
    const combined = new Map(a)
    for (const [branchId, condition] of b) {
      const existing = combined.get(branchId)
      if (existing !== undefined && existing !== condition) {
        throw new WorkflowGraphError(
          `Merge node "${mergeNodeId}" combines two inputs that can never both occur in the same execution — one requires branch "${branchId}" to take "${existing}", the other requires "${condition}"`
        )
      }
      combined.set(branchId, condition)
    }
    return combined
  }
  const requiredChoices = (nodeId: string): BranchChoices => {
    const cached = choicesCache.get(nodeId)
    if (cached) return cached
    let result: BranchChoices
    if (nodeId === graph.entryNodeId) {
      result = new Map()
    } else {
      const incoming = graph.edges.filter((edge) => edge.to === nodeId)
      const [first, second] = incoming
      result =
        second === undefined
          ? withEdge(requiredChoices(first.from), first)
          : combineChoices(
              withEdge(requiredChoices(first.from), first),
              withEdge(requiredChoices(second.from), second),
              nodeId
            )
    }
    choicesCache.set(nodeId, result)
    return result
  }
  for (const node of graph.nodes) {
    requiredChoices(node.id)
  }
}
