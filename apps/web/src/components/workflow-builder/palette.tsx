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
  ghost.style.borderRadius = "6px"
  ghost.style.overflow = "hidden"
  ghost.style.backgroundColor = "var(--popover)"
  ghost.style.border = "1px solid var(--border)"
  ghost.style.clipPath = "inset(0 round 6px)"
  document.body.appendChild(ghost)
  event.dataTransfer.setDragImage(
    ghost,
    event.clientX - rect.left,
    event.clientY - rect.top
  )
  source.addEventListener("dragend", () => ghost.remove(), { once: true })
}

export function WorkflowPalette({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  const [search, setSearch] = useState("")
  const [categoriesCollapsed, setCategoriesCollapsed] = useState<
    Set<NodeUICategory>
  >(() => new Set())
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
      if (collapsed) {
        pendingSearchFocus.current = true
        onCollapsedChange(false)
        return
      }
      searchRef.current?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [collapsed, onCollapsedChange])
  useEffect(() => {
    if (collapsed || !pendingSearchFocus.current) return
    pendingSearchFocus.current = false
    searchRef.current?.focus()
  }, [collapsed])
  return (
    <div className="relative z-20 flex min-h-0 shrink-0 self-stretch">
      <div
        className={cn(
          "min-h-0 self-stretch overflow-hidden transition-[width] duration-500 ease-in",
          collapsed ? "w-0" : "w-52"
        )}
      >
        <aside className="flex h-full min-h-0 w-52 flex-col overflow-hidden bg-card">
          <div className="shrink-0 px-2 pt-2 pb-1.5">
            <InputGroup className="h-8 rounded-md border-input/30 bg-input/30 shadow-none">
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
                className="group px-1.5 pb-0.5"
                open={searching || !categoriesCollapsed.has(category)}
                onOpenChange={(open) => {
                  if (searching) return
                  setCategoriesCollapsed((prev) => {
                    const next = new Set(prev)
                    if (open) next.delete(category)
                    else next.add(category)
                    return next
                  })
                }}
              >
                <CollapsibleTrigger className="flex h-7 w-full cursor-pointer items-center justify-between rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  {NODE_CATEGORY_LABELS[category]}
                  <ChevronDownIcon className="size-3.5 shrink-0 -rotate-90 transition-transform duration-200 group-data-open:rotate-0" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="flex flex-col">
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
                            className="flex h-7 w-full cursor-grab items-center justify-between gap-2 overflow-hidden rounded-md px-1.5 text-left hover:bg-muted active:cursor-grabbing"
                          >
                            <span className="min-w-0 truncate text-xs">
                              {definition.ui.label}
                            </span>
                            <span
                              className={cn(
                                "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                                colors.badge
                              )}
                            >
                              <NodeIcon
                                icon={definition.ui.icon}
                                className="size-2.5"
                              />
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
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        className={cn(
          "absolute top-4 left-full z-10 size-5 border-border bg-card p-0 shadow-none transition-transform duration-500 ease-in dark:bg-card dark:hover:bg-secondary [&_svg:not([class*='size-'])]:size-2.5",
          !collapsed && "-translate-x-1/2"
        )}
        onClick={() => onCollapsedChange(!collapsed)}
        aria-label={collapsed ? "Expand node panel" : "Collapse node panel"}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
      </Button>
    </div>
  )
}
