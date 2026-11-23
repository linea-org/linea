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
  | { status: "completed"; output?: unknown }
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
// output — everything else (including a merge node's edges) activates unconditionally once
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

export type WorkflowWalk = {
  /** Steps that can start now, in the order they became ready; empty once a step has failed. */
  ready: () => readonly WorkflowNode[]
  start: (nodeId: string) => StepToExecute
  finish: (result: StepResult) => void
  result: () => WalkResult
}

/** The caller owns checkpointing and decides how many ready steps run at once. */
export function startWalk(
  graph: WorkflowGraph,
  options: WalkOptions = {}
): WorkflowWalk {
  const completed = new Map(options.completed ?? [])
  const seen = new Set(completed.keys())
  let ready: WorkflowNode[] = []
  let failure: WalkResult | undefined

  function enqueue(nodeId: string): void {
    if (seen.has(nodeId) || !isReady(graph, nodeId, completed)) return
    seen.add(nodeId)
    ready.push(getNode(graph, nodeId))
  }

  // A full scan, not just forward from entryNodeId, so a resumed execution with multiple
  // in-flight branches (some done, some not) recomputes readiness everywhere in the graph.
  for (const node of graph.nodes) {
    enqueue(node.id)
  }

  return {
    ready: () => ready,
    start(nodeId) {
      const node = getNode(graph, nodeId)
      ready = ready.filter(({ id }) => id !== nodeId)
      return {
        nodeId,
        nodeType: node.type,
        input: resolveInput(graph, node, completed, options.triggerPayload),
      }
    },
    finish(result) {
      if ("error" in result) {
        failure ??= {
          status: "failed",
          nodeId: result.nodeId,
          error: result.error.message,
        }
        ready = []
        return
      }
      completed.set(result.nodeId, result.output)
      if (failure) return
      const node = getNode(graph, result.nodeId)
      for (const nextId of nextNodeIds(graph, node, result.output)) {
        enqueue(nextId)
      }
    },
    result: () => failure ?? completedResult(graph, completed),
  }
}

/** The run's result is what its End node produced; with several reached, the last to finish wins.
 * `completed` keeps insertion order, which is completion order, resumed checkpoints included. */
function completedResult(
  graph: WorkflowGraph,
  completed: Map<string, unknown>
): WalkResult {
  const endIds = new Set(
    graph.nodes.filter((node) => node.type === "end").map((node) => node.id)
  )
  const lastEnd = [...completed.keys()].reverse().find((id) => endIds.has(id))
  return lastEnd === undefined
    ? { status: "completed" }
    : { status: "completed", output: completed.get(lastEnd) }
}
