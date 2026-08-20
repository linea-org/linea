import { Handle, Position, type NodeProps } from "@xyflow/react"
import { nodeRegistry } from "@linea/runtime/browser"
import { cn } from "@linea/ui/lib/utils"
import { NodeIcon } from "./node-icon"
import { NODE_CATEGORY_COLORS } from "./node-category-colors"
import { NodeHoverToolbar } from "./node-hover-toolbar"
import type { WorkflowBuilderNodeData } from "./graph-conversion"

const HANDLE_CLASS = "!z-10 !size-3 !border-2 !border-transparent"

type WorkflowNodeShellProps = NodeProps & {
  data: WorkflowBuilderNodeData
}

/** One registry-driven shell for every node type — name, type badge, and optional summaryField. */
export function NodeShell({ id, data, selected }: WorkflowNodeShellProps) {
  const definition = nodeRegistry[data.nodeType]
  const colors = NODE_CATEGORY_COLORS[definition.ui.category]
  const customName =
    typeof data.config.name === "string" ? data.config.name.trim() : ""
  const title = customName || definition.ui.label
  const isStart = data.nodeType === "start"
  const isEnd = data.nodeType === "end"
  const branches =
    data.nodeType === "branch"
      ? Object.keys((data.config.cases as Record<string, unknown>) ?? {})
      : []
  const summaryField = definition.ui.summaryField
  const summaryFieldMeta = summaryField
    ? definition.ui.fields.find((field) => field.key === summaryField)
    : undefined
  const rawSummaryValue = summaryField ? data.config[summaryField] : undefined
  const summaryValue =
    typeof rawSummaryValue === "string" || typeof rawSummaryValue === "number"
      ? String(rawSummaryValue)
      : undefined
  const summaryOptionLabel = summaryFieldMeta?.options?.find(
    (option) => option.value === summaryValue
  )?.label
  return (
    <div
      className={cn(
        "group/node relative w-52 rounded-lg border border-border bg-card shadow-sm",
        selected && "border-primary"
      )}
    >
      {!isStart && (
        <>
          <NodeHoverToolbar nodeId={id} selected={selected} canDelete />
          <Handle
            type="target"
            position={Position.Left}
            className={cn(HANDLE_CLASS, colors.port)}
          />
        </>
      )}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <p className="min-w-0 truncate text-xs font-medium text-foreground">
          {title}
        </p>
        <span
          className={cn(
            "inline-flex h-5 max-w-[7rem] shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium",
            colors.badge
          )}
        >
          <NodeIcon icon={definition.ui.icon} className="size-3 shrink-0" />
          <span className="truncate">{definition.ui.label}</span>
        </span>
      </div>
      {summaryValue !== undefined && (
        <div className="flex min-w-0 items-center gap-1.5 px-2.5 pb-2 text-xs text-muted-foreground">
          {summaryFieldMeta ? (
            <span className="shrink-0">{summaryFieldMeta.label}:</span>
          ) : null}
          <span className="min-w-0 truncate rounded-md border border-border px-1.5 py-0.5">
            {summaryOptionLabel ?? summaryValue}
          </span>
        </div>
      )}
      {branches.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border px-2.5 py-2 text-xs text-muted-foreground">
          {branches.map((branch) => (
            <div
              key={branch}
              className="relative flex items-center justify-between"
            >
              <span>{branch}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={branch}
                className={cn(
                  HANDLE_CLASS,
                  colors.port,
                  "!static !translate-x-0 !translate-y-0"
                )}
              />
            </div>
          ))}
        </div>
      )}
      {branches.length === 0 && !isEnd && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(HANDLE_CLASS, colors.port)}
        />
      )}
    </div>
  )
}
