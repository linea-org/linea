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

type ExecutionsSearch = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
}

export const Route = createFileRoute("/w/$slug/executions/")({
  validateSearch: (search: Record<string, unknown>): ExecutionsSearch => ({
    status: isExecutionStatus(search.status) ? search.status : undefined,
    trigger: isExecutionTrigger(search.trigger) ? search.trigger : undefined,
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
  const initialData = Route.useLoaderData()
  const { data: executions } = useSuspenseQuery({
    ...workspaceExecutionsQueryOptions(slug, search),
    initialData,
  })

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
              }),
            })
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EXECUTION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
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
              }),
            })
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Trigger" />
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
      )}
    </main>
  )
}
