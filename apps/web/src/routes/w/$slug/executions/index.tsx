import { useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { HistoryIcon } from "lucide-react"

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
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
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
  listWorkspaceExecutionsFn,
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

function parsePage(value: unknown): number {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/** Only a valid ISO timestamp counts — anything else falls back to no snapshot (live "now"). */
function parseAsOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : new Date(time).toISOString()
}

type ExecutionsSearch = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
  page?: number
  asOf?: string
}

export const Route = createFileRoute("/w/$slug/executions/")({
  validateSearch: (search: Record<string, unknown>): ExecutionsSearch => ({
    status: isExecutionStatus(search.status) ? search.status : undefined,
    trigger: isExecutionTrigger(search.trigger) ? search.trigger : undefined,
    page: parsePage(search.page),
    asOf: parseAsOf(search.asOf),
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

/** Windows page numbers around the current one, e.g. [1, "ellipsis", 4, 5, 6, "ellipsis", 20], so a large history doesn't render one link per page. */
function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const keep = new Set(
    [1, total, current - 1, current, current + 1].filter(
      (page) => page >= 1 && page <= total
    )
  )
  const sorted = [...keep].sort((a, b) => a - b)
  const result: (number | "ellipsis")[] = []
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) result.push("ellipsis")
    result.push(page)
  })
  return result
}

function ExecutionsPage() {
  const { slug } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const initialData = Route.useLoaderData()
  const { data } = useSuspenseQuery({
    ...workspaceExecutionsQueryOptions(slug, search),
    initialData,
  })
  const { executions, total, pageSize } = data
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = search.page ?? 1
  // Frozen the moment pagination is first used, then reused for every later page in this
  // browsing session — see listWorkspaceExecutions' asOf param for why: without a shared
  // snapshot, a row inserted between page fetches shifts every later page's offset.
  const snapshotAsOf = search.asOf ?? new Date().toISOString()

  function hrefForPage(page: number): string {
    const params = new URLSearchParams()
    if (search.status) params.set("status", search.status)
    if (search.trigger) params.set("trigger", search.trigger)
    if (page > 1) params.set("page", String(page))
    if (page > 1) params.set("asOf", snapshotAsOf)
    const query = params.toString()
    return `/w/${slug}/executions${query ? `?${query}` : ""}`
  }

  function goToPage(page: number) {
    void navigate({
      search: (prev) => ({
        ...prev,
        page,
        asOf: page > 1 ? snapshotAsOf : prev.asOf,
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
                page: 1,
                asOf: undefined,
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
                page: 1,
                asOf: undefined,
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

          {totalPages > 1 ? (
            <Pagination className="mt-6">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={hrefForPage(Math.max(1, currentPage - 1))}
                    aria-disabled={currentPage <= 1}
                    className={
                      currentPage <= 1 ? "pointer-events-none opacity-50" : ""
                    }
                    onClick={(event) => {
                      event.preventDefault()
                      if (currentPage > 1) goToPage(currentPage - 1)
                    }}
                  />
                </PaginationItem>
                {pageNumbers(currentPage, totalPages).map((page, i) =>
                  page === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href={hrefForPage(page)}
                        isActive={page === currentPage}
                        onClick={(event) => {
                          event.preventDefault()
                          goToPage(page)
                        }}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href={hrefForPage(Math.min(totalPages, currentPage + 1))}
                    aria-disabled={currentPage >= totalPages}
                    className={
                      currentPage >= totalPages
                        ? "pointer-events-none opacity-50"
                        : ""
                    }
                    onClick={(event) => {
                      event.preventDefault()
                      if (currentPage < totalPages) goToPage(currentPage + 1)
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </>
      )}
    </main>
  )
}
