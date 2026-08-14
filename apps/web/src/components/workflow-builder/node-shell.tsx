import { Handle, Position, type NodeProps } from "@xyflow/react"
import { nodeRegistry } from "@linea/runtime/browser"
import { cn } from "@linea/ui/lib/utils"
import { NodeIcon } from "./node-icon"
import { NODE_CATEGORY_COLORS } from "./node-category-colors"
import type { WorkflowBuilderNodeData } from "./graph-conversion"

const HANDLE_CLASS = "!z-10 !size-3 !border-2 !border-transparent"

type WorkflowNodeShellProps = NodeProps & {
  data: WorkflowBuilderNodeData
}

/** One registry-driven shell for every node type — icon, name, type, and optional summaryField. */
export function NodeShell({ data, selected }: WorkflowNodeShellProps) {
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
  const rawSummaryValue = definition.ui.summaryField
    ? data.config[definition.ui.summaryField]
    : undefined
  const summaryValue =
    typeof rawSummaryValue === "string" || typeof rawSummaryValue === "number"
      ? String(rawSummaryValue)
      : undefined
  return (
    <div
      className={cn(
        "w-64 rounded-xl border border-border shadow-sm",
        colors.bg,
        selected && "border-primary ring-2 ring-primary/40"
      )}
    >
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(HANDLE_CLASS, colors.port)}
        />
      )}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md bg-background/50",
            colors.icon
          )}
        >
          <NodeIcon icon={definition.ui.icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
          </p>
          {customName ? (
            <p className="truncate text-xs text-muted-foreground">
              {definition.ui.label}
            </p>
          ) : null}
        </div>
      </div>
      {summaryValue !== undefined && (
        <p className="truncate border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {summaryValue}
        </p>
      )}
      {branches.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
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
