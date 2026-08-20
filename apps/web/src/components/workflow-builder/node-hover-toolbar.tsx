import { useReactFlow, type Node } from "@xyflow/react"
import { CopyIcon, Trash2Icon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { cn } from "@linea/ui/lib/utils"
import type { WorkflowBuilderNodeData } from "./graph-conversion"

const TAB_MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 20' preserveAspectRatio='none'%3E%3Cpath fill='black' d='M0 20 L8 6 Q10 0 16 0 H64 Q70 0 72 6 L80 20 Z'/%3E%3C/svg%3E\")"

export function NodeHoverToolbar({
  nodeId,
  selected,
  canDelete,
}: {
  nodeId: string
  selected: boolean
  canDelete: boolean
}) {
  const { getNode, setNodes, setEdges } =
    useReactFlow<Node<WorkflowBuilderNodeData>>()
  function duplicate() {
    const node = getNode(nodeId)
    if (!node || node.data.nodeType === "start") return
    const id = `${node.data.nodeType}-${crypto.randomUUID().slice(0, 8)}`
    setNodes((current) => [
      ...current.map((n) => ({ ...n, selected: false })),
      {
        ...node,
        id,
        selected: true,
        position: { x: node.position.x + 48, y: node.position.y + 48 },
      },
    ])
  }
  function remove() {
    if (!canDelete) return
    setNodes((current) => current.filter((n) => n.id !== nodeId))
    setEdges((current) =>
      current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    )
  }
  return (
    <div
      className={cn(
        "nodrag nopan absolute bottom-[calc(100%-1px)] left-2.5 origin-bottom scale-y-0 transition-transform duration-200 ease-in",
        "pointer-events-none group-hover/node:pointer-events-auto group-hover/node:scale-y-100",
        selected && "pointer-events-auto scale-y-100"
      )}
    >
      <div
        className="flex h-5 items-center gap-0.5 bg-card px-2.5 [filter:drop-shadow(0_-2px_4px_color-mix(in_srgb,var(--shadow-color)_40%,transparent))]"
        style={{
          maskImage: TAB_MASK,
          WebkitMaskImage: TAB_MASK,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-4 text-muted-foreground hover:text-foreground [&_svg:not([class*='size-'])]:size-2.5"
          aria-label="Duplicate node"
          onClick={duplicate}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <CopyIcon />
        </Button>
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-4 text-muted-foreground hover:text-destructive [&_svg:not([class*='size-'])]:size-2.5"
            aria-label="Delete node"
            onClick={remove}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
