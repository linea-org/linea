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

function resolveInput(
  graph: WorkflowGraph,
  node: WorkflowNode,
  completed: Map<string, unknown>,
  triggerPayload: unknown
): unknown {
  if (node.id === graph.entryNodeId) return triggerPayload

  const incoming = graph.edges.filter((edge) => edge.to === node.id)
  if (incoming.length !== 1) {
    throw new WorkflowWalkError(
      `Node "${node.id}" must have exactly one incoming edge, has ${incoming.length}`
    )
  }
  const [edge] = incoming
  if (!completed.has(edge.from)) {
    throw new WorkflowWalkError(
      `Node "${node.id}"'s predecessor "${edge.from}" has not completed`
    )
  }
  return completed.get(edge.from)
}

function nextNodeId(
  graph: WorkflowGraph,
  node: WorkflowNode,
  output: unknown
): string | null {
  const outgoing = graph.edges.filter((edge) => edge.from === node.id)
  if (outgoing.length === 0) return null

  if (node.type === "branch") {
    const branch = (output as { branch: string }).branch
    const matched = outgoing.find((edge) => edge.condition === branch)
    if (!matched) {
      throw new WorkflowWalkError(
        `Branch node "${node.id}" produced unmatched branch "${branch}"`
      )
    }
    return matched.to
  }

  if (outgoing.length > 1) {
    throw new WorkflowWalkError(
      `Node "${node.id}" has multiple outgoing edges but is not a branch node`
    )
  }
  return outgoing[0].to
}

/** Yields one step at a time; the caller owns checkpointing and feeds the result back via .next(). */
export function* walk(
  graph: WorkflowGraph,
  options: WalkOptions = {}
): Generator<StepToExecute, WalkResult, StepResult> {
  const completed = new Map(options.completed ?? [])
  let currentNodeId: string | null = graph.entryNodeId

  while (currentNodeId !== null) {
    const node = getNode(graph, currentNodeId)

    // Skip re-yielding an already-completed node, but its output still feeds branching below.
    if (!completed.has(node.id)) {
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
    }

    currentNodeId = nextNodeId(graph, node, completed.get(node.id))
  }

  return { status: "completed" }
}
