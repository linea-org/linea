import type { NodeTypeId } from "../nodes/node-registry.js"
import type { WorkflowGraph, WorkflowNode } from "../workflow-json/schema.js"

export class WorkflowWalkError extends Error {}

export type StepToExecute = {
  nodeId: string
  nodeType: NodeTypeId
  input: unknown
}

export type StepResult =
  | { nodeId: string; output: unknown }
  | { nodeId: string; error: { message: string } }

export type WalkResult =
  | { status: "completed" }
  | { status: "failed"; nodeId: string; error: string }

export type WalkOptions = {
  // Populate from checkpoints to resume — there is no separate "resume mode".
  completed?: Map<string, unknown>
  triggerPayload?: unknown
}

function getNode(graph: WorkflowGraph, id: string): WorkflowNode {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node) throw new WorkflowWalkError(`Unknown node id: "${id}"`)
  return node
}

function incomingEdges(graph: WorkflowGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.to === nodeId)
}

// A completed branch node doesn't activate all its outgoing edges, only the one matching its
// output — everything else (including a merge node's two edges) activates unconditionally once
// its source is done.
function isEdgeActivated(
  graph: WorkflowGraph,
  edge: WorkflowGraph["edges"][number],
  completed: Map<string, unknown>
): boolean {
  if (!completed.has(edge.from)) return false
  const from = getNode(graph, edge.from)
  if (from.type !== "branch") return true
  const output = completed.get(edge.from) as { branch: string }
  return output.branch === edge.condition
}

// A merge node needs every predecessor's edge activated, not just one — this is the only place
// node type changes what "ready" means; everything else here is predecessor-count-agnostic.
function isReady(
  graph: WorkflowGraph,
  nodeId: string,
  completed: Map<string, unknown>
): boolean {
  return incomingEdges(graph, nodeId).every((edge) =>
    isEdgeActivated(graph, edge, completed)
  )
}

function resolveInput(
  graph: WorkflowGraph,
  node: WorkflowNode,
  completed: Map<string, unknown>,
  triggerPayload: unknown
): unknown {
  if (node.id === graph.entryNodeId) return triggerPayload

  const incoming = incomingEdges(graph, node.id)
  if (node.type === "merge") {
    // Edge-declaration order, not completion order — the same graph always produces the same
    // merge input regardless of which predecessor happens to finish first.
    return incoming.map((edge) => completed.get(edge.from))
  }
  if (incoming.length !== 1) {
    throw new WorkflowWalkError(
      `Node "${node.id}" must have exactly one incoming edge, has ${incoming.length}`
    )
  }
  return completed.get(incoming[0].from)
}

function nextNodeIds(
  graph: WorkflowGraph,
  node: WorkflowNode,
  output: unknown
): string[] {
  const outgoing = graph.edges.filter((edge) => edge.from === node.id)
  if (outgoing.length === 0) return []

  if (node.type === "branch") {
    const branch = (output as { branch: string }).branch
    const matched = outgoing.find((edge) => edge.condition === branch)
    if (!matched) {
      throw new WorkflowWalkError(
        `Branch node "${node.id}" produced unmatched branch "${branch}"`
      )
    }
    return [matched.to]
  }

  // Any number of unconditioned edges are all followed — validateGraphStructure guarantees none
  // of them carry a condition for a non-branch node, so there's nothing to match here.
  return outgoing.map((edge) => edge.to)
}

/** Yields one step at a time; the caller owns checkpointing and feeds the result back via .next().
 * A node is "ready" once every one of its predecessors is in `completed` — for a linear or
 * branch-only graph that's always exactly one node at a time, so this is a strict generalization
 * of the old single-cursor walk, not a behavior change for graphs without a merge node. */
export function* walk(
  graph: WorkflowGraph,
  options: WalkOptions = {}
): Generator<StepToExecute, WalkResult, StepResult> {
  const completed = new Map(options.completed ?? [])

  const queued = new Set<string>()
  const ready: string[] = []
  function enqueue(nodeId: string): void {
    if (completed.has(nodeId) || queued.has(nodeId)) return
    if (!isReady(graph, nodeId, completed)) return
    queued.add(nodeId)
    ready.push(nodeId)
  }

  // A full scan, not just forward from entryNodeId, so a resumed execution with multiple
  // in-flight branches (some done, some not) recomputes readiness everywhere in the graph, not
  // just along the one path the old single-cursor walker used to assume existed.
  for (const node of graph.nodes) {
    enqueue(node.id)
  }

  while (ready.length > 0) {
    const nodeId = ready.shift()
    if (nodeId === undefined) continue
    queued.delete(nodeId)
    if (completed.has(nodeId)) continue

    const node = getNode(graph, nodeId)
    const input = resolveInput(graph, node, completed, options.triggerPayload)
    const result = yield { nodeId: node.id, nodeType: node.type, input }

    if ("error" in result) {
      return {
        status: "failed",
        nodeId: node.id,
        error: result.error.message,
      }
    }
    completed.set(node.id, result.output)

    for (const nextId of nextNodeIds(graph, node, result.output)) {
      enqueue(nextId)
    }
  }

  return { status: "completed" }
}
