import { useMemo, useState } from "react"
import { z } from "zod"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  PencilIcon,
  PencilRulerIcon,
  PlusIcon,
  SearchIcon,
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
  WorkflowFormDialog,
  WorkflowStatusBadge,
  workflowStatus,
} from "@/components/workflows"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { ToolbarSearch } from "@/components/workspace/toolbar-search"
import {
  createWorkflowFn,
  listWorkflowsFn,
  updateWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"
import {
  applicationsQueryOptions,
  listApplicationsFn,
} from "@/lib/applications-api"
import { formatDate } from "@/lib/format"
import {
  WORKFLOW_STATUS_FILTERS,
  isWorkflowStatusFilter,
} from "@/lib/workflow-status-filter"
import { SortDirectionIcon } from "@/components/workspace/sort-direction-icon"
import { ariaSortValue, type SortDirection } from "@/lib/sort"

const workflowsSearchSchema = z.object({
  applicationId: z.uuid().optional(),
  status: z.enum(WORKFLOW_STATUS_FILTERS).optional(),
})

type WorkflowSortColumn = "workflow" | "application" | "status" | "updated"
type WorkflowSort = { column: WorkflowSortColumn; direction: SortDirection }

function workflowSortValue(
  workflow: WorkflowSummary,
  column: WorkflowSortColumn,
  applicationName: string
): string | number {
  switch (column) {
    case "workflow":
      return workflow.name.toLowerCase()
    case "application":
      return applicationName.toLowerCase()
    case "status":
      return workflowStatus(workflow)
    case "updated":
      return new Date(workflow.updatedAt).getTime()
    default: {
      const unreachable: never = column
      return unreachable
    }
  }
}

function compareSortValues(
  left: string | number,
  right: string | number,
  direction: SortDirection
) {
  if (left === right) return 0
  const order = left < right ? -1 : 1
  return direction === "asc" ? order : -order
}

function WorkflowSortHeader({
  column,
  label,
  sorts,
  onSort,
}: Readonly<{
  column: WorkflowSortColumn
  label: string
  sorts: WorkflowSort[]
  onSort: (column: WorkflowSortColumn) => void
}>) {
  const index = sorts.findIndex((item) => item.column === column)
  const active = sorts[index]
  return (
    <TableHead
      aria-sort={ariaSortValue(active?.direction)}
      className="px-4 font-normal text-muted-foreground"
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        {<SortDirectionIcon direction={active?.direction} showIdle />}
        {active && sorts.length > 1 ? (
          <span className="text-[10px] leading-none tabular-nums">
            {index + 1}
          </span>
        ) : null}
      </button>
    </TableHead>
  )
}

export const Route = createFileRoute("/w/$slug/workflows/")({
  validateSearch: workflowsSearchSchema,
  loader: async () => {
    const [workflows, applications] = await Promise.all([
      listWorkflowsFn(),
      listApplicationsFn(),
    ])
    return { workflows, applications }
  },
  component: WorkflowsListPage,
})

function WorkflowsListPage() {
  const { slug } = Route.useParams()
  const { applicationId, status: statusSearch } = Route.useSearch()
  const status = statusSearch ?? "all"
  const initialData = Route.useLoaderData()
  const { data: workflows } = useSuspenseQuery({
    ...workflowsQueryOptions(slug),
    initialData: initialData.workflows,
  })
  const { data: applications } = useSuspenseQuery({
    ...applicationsQueryOptions(slug),
    initialData: initialData.applications,
  })
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const [editingWorkflow, setEditingWorkflow] =
    useState<WorkflowSummary | null>(null)
  const [search, setSearch] = useState("")
  const [sorts, setSorts] = useState<WorkflowSort[]>([])
  const applicationNameById = useMemo(
    () =>
      new Map(
        applications.map((application) => [application.id, application.name])
      ),
    [applications]
  )
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return workflows.filter((workflow) => {
      if (applicationId && workflow.applicationId !== applicationId)
        return false
      if (status !== "all" && workflowStatus(workflow) !== status) return false
      if (!query) return true
      return (
        workflow.name.toLowerCase().includes(query) ||
        workflow.slug.toLowerCase().includes(query)
      )
    })
  }, [workflows, search, status, applicationId])
  const rows = useMemo(() => {
    if (sorts.length === 0) return filtered
    return filtered.slice().sort((left, right) => {
      for (const sort of sorts) {
        const compared = compareSortValues(
          workflowSortValue(
            left,
            sort.column,
            applicationNameById.get(left.applicationId) ?? ""
          ),
          workflowSortValue(
            right,
            sort.column,
            applicationNameById.get(right.applicationId) ?? ""
          ),
          sort.direction
        )
        if (compared !== 0) return compared
      }
      return right.updatedAt.localeCompare(left.updatedAt)
    })
  }, [filtered, sorts, applicationNameById])
  function onSort(column: WorkflowSortColumn) {
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
  function goToBuilder(workflow: { id: string }) {
    return navigate({
      to: "/w/$slug/workflows/$workflowId/builder",
      params: { slug, workflowId: workflow.id },
    })
  }
  async function onWorkflowSaved() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: workflowsQueryOptions(slug).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: ["application-workflows", slug],
      }),
    ])
  }
  const createDialog = (
    <WorkflowFormDialog
      key={applicationId ?? "all"}
      workspaceSlug={slug}
      trigger={
        <Button size="xs">
          <PlusIcon />
          Create workflow
        </Button>
      }
      title="Create workflow"
      submitLabel="Create workflow"
      defaultValues={
        applicationId
          ? { applicationId, name: "", slug: "", description: "" }
          : undefined
      }
      onSubmit={(values) => createWorkflowFn({ data: values })}
      onSuccess={async (workflow) => {
        await onWorkflowSaved()
        await goToBuilder(workflow)
      }}
    />
  )
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PageToolbar>
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder="Search workflows"
        />
        <Select
          value={applicationId ?? "all"}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            void navigate({
              search: {
                applicationId: value === "all" ? undefined : value,
                status: status === "all" ? undefined : status,
              },
            })
          }}
        >
          <SelectTrigger
            size="xs"
            aria-label="Filter by Application"
            className="bg-background"
          >
            <SelectValue>
              {(value: string) =>
                value === "all"
                  ? "All Applications"
                  : (applications.find(
                      (application) => application.id === value
                    )?.name ?? "All Applications")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-max! min-w-(--anchor-width)!">
            <SelectItem value="all">All Applications</SelectItem>
            {applications.map((application) => (
              <SelectItem key={application.id} value={application.id}>
                {application.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            void navigate({
              search: {
                applicationId,
                status:
                  value !== "all" && isWorkflowStatusFilter(value)
                    ? value
                    : undefined,
              },
            })
          }}
        >
          <SelectTrigger size="xs" className="bg-background">
            <SelectValue placeholder="Status">
              {(value: string) => (value === "all" ? "All statuses" : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WORKFLOW_STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter} value={filter}>
                {filter}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">{createDialog}</div>
      </PageToolbar>
      {workflows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>No workflows yet</EmptyTitle>
            <EmptyDescription>
              Create a Workflow in an Application to define its process and
              deploy it to an Environment.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No matching workflows</EmptyTitle>
            <EmptyDescription>
              Try a different Application, search, or status filter.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="px-4 py-2">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <WorkflowSortHeader
                    column="workflow"
                    label="Workflow"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <WorkflowSortHeader
                    column="application"
                    label="Application"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <WorkflowSortHeader
                    column="status"
                    label="Status"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <WorkflowSortHeader
                    column="updated"
                    label="Updated"
                    sorts={sorts}
                    onSort={onSort}
                  />
                  <TableHead className="w-12 px-2">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((workflow) => {
                  const applicationName =
                    applications.find(
                      (application) => application.id === workflow.applicationId
                    )?.name ?? "View Application"
                  return (
                    <TableRow key={workflow.id} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3">
                        <Link
                          to="/w/$slug/workflows/$workflowId"
                          params={{ slug, workflowId: workflow.id }}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <PlayfulAvatar
                            name={workflow.name}
                            shape="rounded"
                            className="size-8"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">
                              {workflow.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {workflow.slug}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Link
                          to="/w/$slug/applications/$applicationId"
                          params={{
                            slug,
                            applicationId: workflow.applicationId,
                          }}
                          search={{ view: "workflows" }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {applicationName}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <WorkflowStatusBadge workflow={workflow} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatDate(workflow.updatedAt)}
                      </TableCell>
                      <TableCell className="px-2 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`More options for ${workflow.name}`}
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
                              onClick={() => void goToBuilder(workflow)}
                            >
                              <PencilRulerIcon />
                              Open builder
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setEditingWorkflow(workflow)}
                            >
                              <PencilIcon />
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {editingWorkflow && (
        <WorkflowFormDialog
          workspaceSlug={slug}
          open
          onOpenChange={(open) => !open && setEditingWorkflow(null)}
          title="Edit workflow"
          submitLabel="Save"
          defaultValues={{
            applicationId: editingWorkflow.applicationId,
            name: editingWorkflow.name,
            slug: editingWorkflow.slug,
            description: editingWorkflow.description ?? "",
          }}
          onSubmit={(values) =>
            updateWorkflowFn({ data: { id: editingWorkflow.id, ...values } })
          }
          onSuccess={onWorkflowSaved}
        />
      )}
    </main>
  )
}
