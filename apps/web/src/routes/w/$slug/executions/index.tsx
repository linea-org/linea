import { useEffect } from "react"
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  EyeIcon,
  HistoryIcon,
  SearchIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import { Card } from "@linealabs/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"

import { PlayfulAvatar } from "@/components/avatar"
import { ExecutionStatusBadge, formatCost } from "@/components/executions"
import {
  encodeExecutionCursor,
  listWorkspaceExecutionsFn,
  newWorkspaceExecutionsQueryOptions,
  workspaceExecutionsQueryOptions,
  type ExecutionStatus,
  type ExecutionTrigger,
  type WorkspaceExecutionSummary,
} from "@/lib/executions-api"
import { rememberExecutionsList } from "@/lib/executions-list-return"
import { formatElapsed } from "@/lib/format"
import { SortableTableHead } from "@/components/workspace/sortable-table-head"
import { useTableSort } from "@/components/workspace/use-table-sort"

import {
  executionStatusDefinition,
  isExecutionStatus,
} from "@/lib/execution-status"
import { isExecutionTrigger, triggerLabel } from "@/lib/execution-trigger"
import { ExecutionFilters } from "@/components/executions/execution-filters"
import {
  DEFAULT_PAGE_SIZE,
  ExecutionsPagination,
  parsePageSize,
  type PageSize,
} from "@/components/executions/executions-pagination"
import { PageToolbar } from "@/components/workspace/page-toolbar"

function parseOpaqueParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

type ExecutionsSearch = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
  /** Opaque keyset cursor for the current page — the last row of the previous page, absent on page 1. See listWorkspaceExecutions in @linealabs/db for why this isn't a page number. */
  cursor?: string
  /** Semicolon-joined breadcrumb of ancestor cursors used to reach the current page, so Previous can step back without recomputing history. An empty-string entry means "page 1, no cursor". */
  trail?: string
  /** Cursor of the newest row visible when this browsing session started, fixed the moment pagination is first used — the reference point for "N new executions" polling, so it stays relative to where the user started rather than the current page. */
  anchor?: string
  size?: PageSize
}

export const Route = createFileRoute("/w/$slug/executions/")({
  validateSearch: (search: Record<string, unknown>): ExecutionsSearch => ({
    status: isExecutionStatus(search.status) ? search.status : undefined,
    trigger: isExecutionTrigger(search.trigger) ? search.trigger : undefined,
    cursor: parseOpaqueParam(search.cursor),
    trail: parseOpaqueParam(search.trail),
    anchor: parseOpaqueParam(search.anchor),
    size: parsePageSize(search.size),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listWorkspaceExecutionsFn({
      data: { ...deps, limit: deps.size ?? DEFAULT_PAGE_SIZE },
    }),
  component: ExecutionsPage,
})

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
  status: ExecutionStatus
) {
  if (startedAt && completedAt) {
    return formatElapsed(startedAt, completedAt)
  }
  switch (status) {
    case "queued":
    case "running":
      return "Running…"
    case "paused":
      return "Paused"
    case "succeeded":
    case "failed":
    case "cancelled":
      return "—"
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

type ExecutionSortColumn =
  "workflow" | "status" | "trigger" | "duration" | "cost" | "when"

function durationMs(execution: WorkspaceExecutionSummary) {
  if (!execution.startedAt) return null
  if (!execution.completedAt) return Number.POSITIVE_INFINITY
  return (
    new Date(execution.completedAt).getTime() -
    new Date(execution.startedAt).getTime()
  )
}

function sortValue(
  execution: WorkspaceExecutionSummary,
  column: ExecutionSortColumn
) {
  switch (column) {
    case "workflow":
      return execution.workflowName.toLowerCase()
    case "status":
      return executionStatusDefinition[execution.status].label
    case "trigger":
      return triggerLabel[execution.trigger]
    case "duration":
      return durationMs(execution)
    case "cost": {
      const amount = Number(execution.costMicros)
      return Number.isFinite(amount) ? amount : null
    }
    case "when":
      return new Date(execution.createdAt).getTime()
    default: {
      const unreachable: never = column
      return unreachable
    }
  }
}

function ExecutionsPage() {
  const { slug } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const initialData = Route.useLoaderData()
  const { data } = useSuspenseQuery({
    ...workspaceExecutionsQueryOptions(slug, {
      ...search,
      limit: search.size ?? DEFAULT_PAGE_SIZE,
    }),
    initialData,
  })
  const { executions, hasMore, total } = data
  useEffect(() => rememberExecutionsList(slug, search), [slug, search])
  const {
    sorted: sortedExecutions,
    sorts,
    onSort,
  } = useTableSort<WorkspaceExecutionSummary, ExecutionSortColumn>(
    executions,
    sortValue,
    (left, right) => right.createdAt.localeCompare(left.createdAt)
  )

  const trail = search.trail ? search.trail.split(";") : []
  const isFirstPage = trail.length === 0 && !search.cursor
  const currentPageNumber = trail.length + 1
  const lastRow = executions[executions.length - 1]
  const nextCursor = lastRow ? encodeExecutionCursor(lastRow) : undefined
  const previousCursor = trail.length > 0 ? trail[trail.length - 1] : undefined
  const previousTrail = trail.length > 0 ? trail.slice(0, -1) : []

  // Until pagination is used, page 1's own top row is the reference point — see the `anchor` field's doc comment on ExecutionsSearch.
  const firstRow = executions[0]
  const effectiveAnchor =
    search.anchor ??
    (isFirstPage && firstRow ? encodeExecutionCursor(firstRow) : undefined)

  const { data: newData } = useQuery({
    ...newWorkspaceExecutionsQueryOptions(slug, {
      status: search.status,
      trigger: search.trigger,
      since: effectiveAnchor ?? "",
    }),
    enabled: Boolean(effectiveAnchor),
  })
  const newCount = newData?.count ?? 0

  function hrefFor(overrides: Partial<ExecutionsSearch>): string {
    const merged = { ...search, ...overrides }
    const params = new URLSearchParams()
    if (merged.status) params.set("status", merged.status)
    if (merged.trigger) params.set("trigger", merged.trigger)
    if (merged.cursor) params.set("cursor", merged.cursor)
    if (merged.trail) params.set("trail", merged.trail)
    if (merged.anchor) params.set("anchor", merged.anchor)
    if (merged.size) params.set("size", String(merged.size))
    const query = params.toString()
    return `/w/${slug}/executions${query ? `?${query}` : ""}`
  }

  function goNext() {
    if (!nextCursor) return
    void navigate({
      search: (prev) => ({
        ...prev,
        cursor: nextCursor,
        trail: [...trail, prev.cursor ?? ""].join(";"),
        anchor: prev.anchor ?? effectiveAnchor,
      }),
    })
  }

  function goPrevious() {
    if (isFirstPage) return
    void navigate({
      search: (prev) => ({
        ...prev,
        cursor: previousCursor || undefined,
        trail: previousTrail.length > 0 ? previousTrail.join(";") : undefined,
      }),
    })
  }

  function showNewExecutions() {
    // Navigating alone is a no-op if we're already on page 1 with an implicit anchor (the search object wouldn't change), so invalidate explicitly to force the refetch either way.
    void queryClient.invalidateQueries({
      queryKey: ["workspace-executions", slug],
    })
    void navigate({
      search: (prev) => ({
        ...prev,
        cursor: undefined,
        trail: undefined,
        anchor: undefined,
      }),
    })
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
      <PageToolbar>
        <ExecutionFilters
          values={{ status: search.status, trigger: search.trigger }}
          onChange={(values) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                ...values,
                cursor: undefined,
                trail: undefined,
                anchor: undefined,
              }),
            })
          }
        />
      </PageToolbar>
      {newCount > 0 ? (
        <div>
          <button
            type="button"
            onClick={showNewExecutions}
            className="flex w-fit items-center gap-2 rounded-md border border-input bg-accent px-3 py-1.5 text-sm text-accent-foreground transition-colors hover:bg-accent/80"
          >
            <SparklesIcon className="size-4" />
            {newCount === 1
              ? "1 new execution — refresh"
              : `${newCount} new executions — refresh`}
          </button>
        </div>
      ) : null}
      {executions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {search.status || search.trigger ? (
                <SearchIcon />
              ) : (
                <HistoryIcon />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {search.status || search.trigger
                ? "No matching executions"
                : "No executions yet"}
            </EmptyTitle>
            <EmptyDescription>
              {search.status || search.trigger
                ? "Try a different status or trigger filter."
                : "Runs of any workflow in this workspace will show up here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <SortableTableHead
                    column="workflow"
                    label="Workflow"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    column="status"
                    label="Status"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    column="trigger"
                    label="Trigger"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    column="duration"
                    label="Duration"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    column="cost"
                    label="Cost"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    column="when"
                    label="When"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <TableHead className="w-12 px-2">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedExecutions.map((execution) => (
                  <TableRow key={execution.id}>
                    <TableCell className="px-4">
                      <Link
                        to="/w/$slug/executions/$executionId"
                        params={{ slug, executionId: execution.id }}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <PlayfulAvatar
                          name={execution.workflowName}
                          shape="rounded"
                          className="size-6"
                        />
                        <span className="truncate text-sm font-medium">
                          {execution.workflowName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4">
                      <ExecutionStatusBadge status={execution.status} />
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground">
                      {triggerLabel[execution.trigger]}
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground">
                      {formatDuration(
                        execution.startedAt,
                        execution.completedAt,
                        execution.status
                      )}
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground">
                      {formatCost(execution.costMicros, execution.costUnpriced)}
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground tabular-nums">
                      {new Date(execution.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`More options for ${execution.workflowName}`}
                            />
                          }
                        >
                          <EllipsisVerticalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48 min-w-48"
                        >
                          <DropdownMenuItem
                            onClick={() =>
                              void navigate({
                                to: "/w/$slug/executions/$executionId",
                                params: { slug, executionId: execution.id },
                              })
                            }
                          >
                            <EyeIcon />
                            View execution
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (execution.workflowId)
                                void navigate({
                                  to: "/w/$slug/workflows/$workflowId",
                                  params: {
                                    slug,
                                    workflowId: execution.workflowId,
                                  },
                                })
                              else if (execution.agentId)
                                void navigate({
                                  to: "/w/$slug/agents/$agentId",
                                  params: {
                                    slug,
                                    agentId: execution.agentId,
                                  },
                                })
                            }}
                          >
                            <WorkflowIcon />
                            {execution.agentId ? "Open Agent" : "Open workflow"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ExecutionsPagination
            page={currentPageNumber}
            pageSize={search.size ?? DEFAULT_PAGE_SIZE}
            rowCount={executions.length}
            total={total}
            previous={{
              href: hrefFor({
                cursor: previousCursor || undefined,
                trail:
                  previousTrail.length > 0
                    ? previousTrail.join(";")
                    : undefined,
              }),
              enabled: !isFirstPage,
              onGo: goPrevious,
            }}
            next={{
              href: hrefFor({
                cursor: nextCursor,
                trail: [...trail, search.cursor ?? ""].join(";"),
              }),
              enabled: hasMore,
              onGo: goNext,
            }}
            onPageSizeChange={(size) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  size: size === DEFAULT_PAGE_SIZE ? undefined : size,
                  cursor: undefined,
                  trail: undefined,
                  anchor: undefined,
                }),
              })
            }
          />
        </Card>
      )}
    </main>
  )
}
