import { useMemo, useState } from "react"
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  HistoryIcon,
  SearchIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@linea/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import { PlayfulAvatar } from "@/components/avatar"
import {
  ExecutionStatusBadge,
  executionStatusLabel,
  formatCost,
} from "@/components/executions"
import {
  encodeExecutionCursor,
  listWorkspaceExecutionsFn,
  newWorkspaceExecutionsQueryOptions,
  workspaceExecutionsQueryOptions,
  type ExecutionStatus,
  type ExecutionTrigger,
  type WorkspaceExecutionSummary,
} from "@/lib/executions-api"
import { formatElapsed } from "@/lib/format"

const EXECUTION_STATUSES: ExecutionStatus[] = [
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
]
const EXECUTION_TRIGGERS: ExecutionTrigger[] = [
  "manual",
  "schedule",
  "webhook",
  "api",
]

function isExecutionStatus(value: unknown): value is ExecutionStatus {
  return EXECUTION_STATUSES.includes(value as ExecutionStatus)
}

function isExecutionTrigger(value: unknown): value is ExecutionTrigger {
  return EXECUTION_TRIGGERS.includes(value as ExecutionTrigger)
}

function parseOpaqueParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

type ExecutionsSearch = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
  /** Opaque keyset cursor for the current page — the last row of the previous page, absent on page 1. See listWorkspaceExecutions in @linea/db for why this isn't a page number. */
  cursor?: string
  /** Semicolon-joined breadcrumb of ancestor cursors used to reach the current page, so Previous can step back without recomputing history. An empty-string entry means "page 1, no cursor". */
  trail?: string
  /** Cursor of the newest row visible when this browsing session started, fixed the moment pagination is first used — the reference point for "N new executions" polling, so it stays relative to where the user started rather than the current page. */
  anchor?: string
}

export const Route = createFileRoute("/w/$slug/executions/")({
  validateSearch: (search: Record<string, unknown>): ExecutionsSearch => ({
    status: isExecutionStatus(search.status) ? search.status : undefined,
    trigger: isExecutionTrigger(search.trigger) ? search.trigger : undefined,
    cursor: parseOpaqueParam(search.cursor),
    trail: parseOpaqueParam(search.trail),
    anchor: parseOpaqueParam(search.anchor),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listWorkspaceExecutionsFn({ data: deps }),
  component: ExecutionsPage,
})

const triggerLabel: Record<ExecutionTrigger, string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  api: "API",
}

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
  | "workflow"
  | "status"
  | "trigger"
  | "duration"
  | "cost"
  | "when"
type SortDirection = "asc" | "desc"
type ExecutionSort = { column: ExecutionSortColumn; direction: SortDirection }

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
      return executionStatusLabel[execution.status]
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

function compareSortValues(
  left: string | number | null,
  right: string | number | null,
  direction: SortDirection
) {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  if (left === right) return 0
  const order = left < right ? -1 : 1
  return direction === "asc" ? order : -order
}

function sortExecutions(
  executions: WorkspaceExecutionSummary[],
  sorts: ExecutionSort[]
) {
  if (sorts.length === 0) return executions
  return executions.slice().sort((left, right) => {
    for (const sort of sorts) {
      const compared = compareSortValues(
        sortValue(left, sort.column),
        sortValue(right, sort.column),
        sort.direction
      )
      if (compared !== 0) return compared
    }
    return right.createdAt.localeCompare(left.createdAt)
  })
}

function ExecutionSortHeader({
  column,
  label,
  sorts,
  onSort,
}: {
  column: ExecutionSortColumn
  label: string
  sorts: ExecutionSort[]
  onSort: (column: ExecutionSortColumn) => void
}) {
  const index = sorts.findIndex((item) => item.column === column)
  const active = sorts[index]
  return (
    <TableHead
      aria-sort={
        active
          ? active.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className="px-4 font-normal text-muted-foreground"
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        title={`Sort this page by ${label.toLowerCase()}`}
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          active.direction === "asc" ? (
            <ChevronUpIcon className="size-3" />
          ) : (
            <ChevronDownIcon className="size-3" />
          )
        ) : null}
        {active && sorts.length > 1 ? (
          <span className="text-[10px] leading-none tabular-nums">
            {index + 1}
          </span>
        ) : null}
      </button>
    </TableHead>
  )
}

function ExecutionsPage() {
  const { slug } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const initialData = Route.useLoaderData()
  const { data } = useSuspenseQuery({
    ...workspaceExecutionsQueryOptions(slug, search),
    initialData,
  })
  const { executions, hasMore, total } = data
  const [sorts, setSorts] = useState<ExecutionSort[]>([])
  const sortedExecutions = useMemo(
    () => sortExecutions(executions, sorts),
    [executions, sorts]
  )
  function onSort(column: ExecutionSortColumn) {
    setSorts((current) => {
      const index = current.findIndex((item) => item.column === column)
      if (index === -1) return [...current, { column, direction: "asc" }]
      const item = current[index]
      if (!item || item.direction === "desc") {
        return current.filter((entry) => entry.column !== column)
      }
      return current.map((entry) =>
        entry.column === column ? { column, direction: "desc" } : entry
      )
    })
  }

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
    <main className="flex min-w-0 flex-1 flex-col px-4 py-2">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={search.status ?? "all"}
          onValueChange={(value) => {
            void navigate({
              search: (prev) => ({
                ...prev,
                status:
                  value === "all" ? undefined : (value as ExecutionStatus),
                cursor: undefined,
                trail: undefined,
                anchor: undefined,
              }),
            })
          }}
        >
          <SelectTrigger size="xs">
            <SelectValue placeholder="Status">
              {(value: string) =>
                value === "all"
                  ? "All statuses"
                  : executionStatusLabel[value as ExecutionStatus]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EXECUTION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {executionStatusLabel[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={search.trigger ?? "all"}
          onValueChange={(value) => {
            void navigate({
              search: (prev) => ({
                ...prev,
                trigger:
                  value === "all" ? undefined : (value as ExecutionTrigger),
                cursor: undefined,
                trail: undefined,
                anchor: undefined,
              }),
            })
          }}
        >
          <SelectTrigger size="xs">
            <SelectValue placeholder="Trigger">
              {(value: string) =>
                value === "all"
                  ? "All triggers"
                  : triggerLabel[value as ExecutionTrigger]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All triggers</SelectItem>
            {EXECUTION_TRIGGERS.map((trigger) => (
              <SelectItem key={trigger} value={trigger}>
                {triggerLabel[trigger]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {newCount > 0 ? (
        <div className="mb-4">
          <button
            type="button"
            onClick={showNewExecutions}
            className="flex w-fit items-center gap-2 rounded-md border border-input bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent/80"
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
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {sorts.length > 0 && (
              <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                Sorting applies to this page only. Pages remain ordered newest
                first.
              </p>
            )}
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <ExecutionSortHeader
                    column="workflow"
                    label="Workflow"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <ExecutionSortHeader
                    column="status"
                    label="Status"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <ExecutionSortHeader
                    column="trigger"
                    label="Trigger"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <ExecutionSortHeader
                    column="duration"
                    label="Duration"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <ExecutionSortHeader
                    column="cost"
                    label="Cost"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <ExecutionSortHeader
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
                  <TableRow key={execution.id} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3">
                      <Link
                        to="/w/$slug/executions/$executionId"
                        params={{ slug, executionId: execution.id }}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <PlayfulAvatar
                          name={execution.workflowName}
                          shape="rounded"
                          className="size-8"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">
                            {execution.workflowName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {execution.workflowSlug}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <ExecutionStatusBadge status={execution.status} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {triggerLabel[execution.trigger]}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {formatDuration(
                        execution.startedAt,
                        execution.completedAt,
                        execution.status
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {formatCost(execution.costMicros, execution.costUnpriced)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                      {new Date(execution.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
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
                            onClick={() =>
                              void navigate({
                                to: "/w/$slug/workflows/$workflowId",
                                params: {
                                  slug,
                                  workflowId: execution.workflowId,
                                },
                              })
                            }
                          >
                            <WorkflowIcon />
                            Open workflow
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {isFirstPage && !hasMore ? null : (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {currentPageNumber} · {total} total
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href={hrefFor({
                        cursor: previousCursor || undefined,
                        trail:
                          previousTrail.length > 0
                            ? previousTrail.join(";")
                            : undefined,
                      })}
                      aria-disabled={isFirstPage}
                      className={
                        isFirstPage ? "pointer-events-none opacity-50" : ""
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        goPrevious()
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href={hrefFor({
                        cursor: nextCursor,
                        trail: [...trail, search.cursor ?? ""].join(";"),
                      })}
                      aria-disabled={!hasMore}
                      className={
                        !hasMore ? "pointer-events-none opacity-50" : ""
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        goNext()
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </main>
  )
}
