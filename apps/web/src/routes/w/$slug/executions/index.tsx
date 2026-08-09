import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { HistoryIcon, SparklesIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
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

import {
  ExecutionStatusBadge,
  executionStatusLabel,
  formatCost,
} from "../../../../components/executions"
import {
  encodeExecutionCursor,
  listWorkspaceExecutionsFn,
  newWorkspaceExecutionsQueryOptions,
  workspaceExecutionsQueryOptions,
  type ExecutionStatus,
  type ExecutionTrigger,
} from "../../../../lib/executions-api"

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

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return "—"
  if (!completedAt) return "Running…"
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
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
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-center gap-3">
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
          <SelectTrigger size="sm">
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
          <SelectTrigger size="sm">
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
        <button
          type="button"
          onClick={showNewExecutions}
          className="mt-4 flex w-fit items-center gap-2 rounded-md border border-input bg-accent px-3 py-1.5 text-sm text-accent-foreground transition-colors hover:bg-accent/80"
        >
          <SparklesIcon className="size-4" />
          {newCount === 1
            ? "1 new execution — refresh"
            : `${newCount} new executions — refresh`}
        </button>
      ) : null}

      {executions.length === 0 ? (
        <Empty className="mt-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>No executions yet</EmptyTitle>
            <EmptyDescription>
              Runs of any workflow in this workspace will show up here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent />
        </Empty>
      ) : (
        <>
          <Table className="mt-6">
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((execution) => (
                <TableRow key={execution.id}>
                  <TableCell>
                    <Link
                      to="/w/$slug/workflows/$workflowId"
                      params={{ slug, workflowId: execution.workflowId }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {execution.workflowName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/w/$slug/workflows/$workflowId/executions/$executionId"
                      params={{
                        slug,
                        workflowId: execution.workflowId,
                        executionId: execution.id,
                      }}
                    >
                      <ExecutionStatusBadge status={execution.status} />
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {triggerLabel[execution.trigger]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDuration(execution.startedAt, execution.completedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCost(execution.costMicros)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(execution.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {isFirstPage && !hasMore ? null : (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
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
