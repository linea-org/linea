import { useEffect, useMemo } from "react"
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useTheme } from "next-themes"

import type { WorkflowGraph } from "@linealabs/runtime/browser"

import {
  ensureStartNode,
  graphToFlow,
  WORKFLOW_NODE_TYPE,
} from "../workflow-builder/graph-conversion"
import { FLOW_THEME_VARS } from "../workflow-builder/flow-theme"
import { NodeShell } from "../workflow-builder/node-shell"

const nodeTypes: NodeTypes = { [WORKFLOW_NODE_TYPE]: NodeShell }

// fit: the whole graph, as a thumbnail. explore: the whole graph, scroll to zoom.
export type PreviewView = "fit" | "explore"

const FIT_OPTIONS = { padding: 0.1, minZoom: 0.02, maxZoom: 1 }

// The first fit can run while a resizable panel is still opening; fit again once it has its size.
function RefitOnResize() {
  const { fitView } = useReactFlow()
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  useEffect(() => {
    if (width === 0 || height === 0) return
    const frame = requestAnimationFrame(() => void fitView(FIT_OPTIONS))
    return () => cancelAnimationFrame(frame)
  }, [width, height, fitView])
  return null
}

export function WorkflowPreview({
  graph,
  view,
}: Readonly<{
  graph: WorkflowGraph
  view: PreviewView
}>) {
  const { resolvedTheme } = useTheme()
  const flow = useMemo(() => {
    const { nodes, edges } = graphToFlow(ensureStartNode(graph))
    return {
      nodes: nodes.map((node) => ({
        ...node,
        data: { ...node.data, readOnly: true },
      })),
      edges,
    }
  }, [graph])
  return (
    <ReactFlowProvider>
      <ReactFlow
        key={`${view}:${flow.nodes.map((node) => node.id).join(",")}`}
        className="h-full [&_.react-flow__node]:overflow-visible [&_.react-flow__node]:rounded-lg [&_.react-flow__node]:bg-transparent [&_.react-flow__node]:p-0 [&_.react-flow__node]:shadow-none"
        style={FLOW_THEME_VARS}
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={view === "explore"}
        minZoom={0.02}
        maxZoom={1}
        fitView
        fitViewOptions={FIT_OPTIONS}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <RefitOnResize />
      </ReactFlow>
    </ReactFlowProvider>
  )
}
