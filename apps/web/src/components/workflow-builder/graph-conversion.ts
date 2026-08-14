import type { Edge, Node } from "@xyflow/react"
import type { NodeTypeId } from "@linea/runtime/browser"

export type WorkflowBuilderNodeData = {
  nodeType: NodeTypeId
  config: Record<string, unknown>
}

export const WORKFLOW_NODE_TYPE = "workflowNode"
export const START_NODE_ID = "start"

const LEVEL_WIDTH = 280
const ROW_HEIGHT = 140

type RawNode = {
  id: string
  type: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}

type RawEdge = {
  from: string
  to: string
  condition?: string
}

type RawGraph = {
  entryNodeId?: string
  trigger?: Record<string, unknown>
  nodes: RawNode[]
  edges: RawEdge[]
}

/** The Start node's config is the builder's source of truth for the trigger — this is the seam that keeps it in sync with the graph's own `trigger` field, which the schema/execution layer still owns. */
function triggerToStartConfig(
  trigger: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!trigger || typeof trigger.type !== "string") {
    return { triggerType: "manual" }
  }
  const { type, ...rest } = trigger
  return { triggerType: type, ...rest }
}

export function startConfigToTrigger(
  config: Record<string, unknown>
): Record<string, unknown> {
  const { triggerType, ...rest } = config
  return {
    type: typeof triggerType === "string" ? triggerType : "manual",
    ...rest,
  }
}

/** The graph is a tree (every non-entry node has exactly one incoming edge), so a simple BFS-by-depth layout is enough — no need for a general DAG layout library. */
function autoLayout(nodes: RawNode[], edges: RawEdge[], entryNodeId?: string) {
  const positions = new Map<string, { x: number; y: number }>()
  const childrenByParent = new Map<string, string[]>()
  for (const edge of edges) {
    const siblings = childrenByParent.get(edge.from) ?? []
    siblings.push(edge.to)
    childrenByParent.set(edge.from, siblings)
  }

  const rootId = entryNodeId ?? nodes[0]?.id
  const visited = new Set<string>()
  let queue = rootId ? [rootId] : []
  let depth = 0
  while (queue.length > 0) {
    queue.forEach((id, row) => {
      if (visited.has(id)) return
      visited.add(id)
      positions.set(id, { x: depth * LEVEL_WIDTH, y: row * ROW_HEIGHT })
    })
    const next: string[] = []
    for (const id of queue) {
      for (const childId of childrenByParent.get(id) ?? []) {
        if (!visited.has(childId)) next.push(childId)
      }
    }
    queue = next
    depth += 1
  }

  // A node unreachable from entryNodeId (a mid-edit draft) still needs a spot.
  let strayRow = 0
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: -LEVEL_WIDTH, y: strayRow * ROW_HEIGHT })
      strayRow += 1
    }
  }

  return positions
}

export function ensureStartNode(graph: RawGraph): RawGraph & {
  entryNodeId: string
} {
  const existing = graph.nodes.find((node) => node.type === "start")
  if (existing) {
    const needsSeed = !existing.config?.triggerType
    if (!needsSeed) return { ...graph, entryNodeId: existing.id }
    const seededNodes = graph.nodes.map((node) =>
      node.id === existing.id
        ? { ...node, config: triggerToStartConfig(graph.trigger) }
        : node
    )
    return { ...graph, nodes: seededNodes, entryNodeId: existing.id }
  }
  const taken = new Set(graph.nodes.map((node) => node.id))
  const id = taken.has(START_NODE_ID)
    ? `${START_NODE_ID}-${crypto.randomUUID().slice(0, 8)}`
    : START_NODE_ID
  const previousEntry = graph.nodes.find(
    (node) => node.id === graph.entryNodeId
  )
  const position = previousEntry?.position
    ? { x: previousEntry.position.x - LEVEL_WIDTH, y: previousEntry.position.y }
    : { x: 80, y: 180 }
  const startNode: RawNode = {
    id,
    type: "start",
    config: triggerToStartConfig(graph.trigger),
    position,
  }
  const edges = [...graph.edges]
  if (previousEntry) {
    edges.unshift({ from: id, to: previousEntry.id })
  }
  return {
    ...graph,
    entryNodeId: id,
    nodes: [startNode, ...graph.nodes],
    edges,
  }
}

export function graphToFlow(graph: RawGraph): {
  nodes: Node<WorkflowBuilderNodeData>[]
  edges: Edge[]
} {
  const needsLayout = graph.nodes.some((n) => !n.position)
  const laidOut = needsLayout
    ? autoLayout(graph.nodes, graph.edges, graph.entryNodeId)
    : undefined

  const nodes: Node<WorkflowBuilderNodeData>[] = graph.nodes.map((node) => ({
    id: node.id,
    type: WORKFLOW_NODE_TYPE,
    position: node.position ?? laidOut?.get(node.id) ?? { x: 0, y: 0 },
    deletable: node.type !== "start",
    data: {
      nodeType: node.type as NodeTypeId,
      config: node.config ?? {},
    },
  }))

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}${edge.condition ? `:${edge.condition}` : ""}`,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.condition,
    label: edge.condition,
  }))

  return { nodes, edges }
}

export function flowToGraph(
  nodes: Node<WorkflowBuilderNodeData>[],
  edges: Edge[],
  entryNodeId: string
): RawGraph {
  return {
    entryNodeId,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      config: node.data.config,
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      condition: edge.sourceHandle ?? undefined,
    })),
  }
}
