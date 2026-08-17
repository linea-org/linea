import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import {
  nodeRegistry,
  type NodeTypeId,
  type NodeUICategory,
} from "@linea/runtime/browser"
import {
  ChevronDownIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  SearchIcon,
} from "lucide-react"
import { Button } from "@linea/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@linea/ui/components/collapsible"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@linea/ui/components/input-group"
import { Kbd } from "@linea/ui/components/kbd"
import { cn } from "@linea/ui/lib/utils"
import { NodeIcon } from "./node-icon"
import {
  NODE_CATEGORY_COLORS,
  NODE_CATEGORY_LABELS,
} from "./node-category-colors"

export const PALETTE_DRAG_MIME = "application/linea-node-type"

function setRoundedDragImage(
  event: DragEvent<HTMLButtonElement>,
  source: HTMLElement
) {
  const ghost = source.cloneNode(true)
  if (!(ghost instanceof HTMLElement) || !event.dataTransfer) return
  const rect = source.getBoundingClientRect()
  ghost.style.position = "absolute"
  ghost.style.top = "-9999px"
  ghost.style.left = "-9999px"
  ghost.style.width = `${rect.width}px`
  ghost.style.margin = "0"
  ghost.style.pointerEvents = "none"
  ghost.style.borderRadius = "12px"
  ghost.style.overflow = "hidden"
  ghost.style.clipPath = "inset(0 round 12px)"
  document.body.appendChild(ghost)
  event.dataTransfer.setDragImage(
    ghost,
    event.clientX - rect.left,
    event.clientY - rect.top
  )
  source.addEventListener("dragend", () => ghost.remove(), { once: true })
}

export function WorkflowPalette() {
  const [search, setSearch] = useState("")
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<NodeUICategory>>(
    () => new Set()
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const pendingSearchFocus = useRef(false)
  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase()
    const byCategory = new Map<NodeUICategory, NodeTypeId[]>()
    for (const [id, definition] of Object.entries(nodeRegistry) as [
      NodeTypeId,
      (typeof nodeRegistry)[NodeTypeId],
    ][]) {
      if (id === "start") continue
      if (query && !definition.ui.label.toLowerCase().includes(query)) continue
      const list = byCategory.get(definition.ui.category) ?? []
      list.push(id)
      byCategory.set(definition.ui.category, list)
    }
    return byCategory
  }, [search])
  const searching = search.trim().length > 0
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      if (panelCollapsed) {
        pendingSearchFocus.current = true
        setPanelCollapsed(false)
        return
      }
      searchRef.current?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [panelCollapsed])
  useEffect(() => {
    if (panelCollapsed || !pendingSearchFocus.current) return
    pendingSearchFocus.current = false
    searchRef.current?.focus()
  }, [panelCollapsed])
  return (
    <div className="relative z-10 flex min-h-0 shrink-0">
      {!panelCollapsed && (
        <aside className="flex min-h-0 w-64 flex-col self-stretch overflow-hidden border-r border-border bg-card">
          <div className="shrink-0 p-3">
            <InputGroup className="h-8 rounded-lg border-input/30 bg-input/30 shadow-none">
              <InputGroupAddon>
                <SearchIcon className="size-4 shrink-0 opacity-50" />
              </InputGroupAddon>
              <InputGroupInput
                ref={searchRef}
                placeholder="Search nodes"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <InputGroupAddon
                align="inline-end"
                className="group-focus-within/input-group:hidden"
              >
                <Kbd>Ctrl+K</Kbd>
              </InputGroupAddon>
            </InputGroup>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {[...grouped.entries()].map(([category, nodeTypes]) => (
              <Collapsible
                key={category}
                className="group px-3 pb-3"
                open={searching || !collapsed.has(category)}
                onOpenChange={(open) => {
                  if (searching) return
                  setCollapsed((prev) => {
                    const next = new Set(prev)
                    if (open) next.delete(category)
                    else next.add(category)
                    return next
                  })
                }}
              >
                <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  {NODE_CATEGORY_LABELS[category]}
                  <ChevronDownIcon className="size-3.5 shrink-0 -rotate-90 transition-transform duration-200 group-data-open:rotate-0" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-1.5 flex flex-col gap-2">
                    {nodeTypes.map((nodeType) => {
                      const definition = nodeRegistry[nodeType]
                      const colors =
                        NODE_CATEGORY_COLORS[definition.ui.category]
                      return (
                        <li key={nodeType}>
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                PALETTE_DRAG_MIME,
                                nodeType
                              )
                              e.dataTransfer.effectAllowed = "move"
                              setRoundedDragImage(e, e.currentTarget)
                            }}
                            title={definition.ui.description}
                            className={cn(
                              "flex w-full cursor-grab items-center gap-2.5 overflow-hidden rounded-xl border border-border px-2.5 py-2 text-left shadow-none hover:opacity-90 active:cursor-grabbing",
                              colors.bg
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-md bg-background/50",
                                colors.icon
                              )}
                            >
                              <NodeIcon
                                icon={definition.ui.icon}
                                className="size-4"
                              />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {definition.ui.label}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </aside>
      )}
      <Button
        type="button"
        variant="outline"
        size={panelCollapsed ? "icon-sm" : "icon-xs"}
        className={cn(
          "border-border bg-card shadow-none dark:bg-card dark:hover:bg-secondary",
          panelCollapsed
            ? "mt-2"
            : "absolute top-5 right-0.5 z-10 translate-x-1/2"
        )}
        onClick={() => setPanelCollapsed((current) => !current)}
        aria-label={
          panelCollapsed ? "Expand node panel" : "Collapse node panel"
        }
        aria-expanded={!panelCollapsed}
      >
        {panelCollapsed ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
      </Button>
    </div>
  )
}
