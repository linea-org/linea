import { useMemo, useState } from "react"
import { z } from "zod"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  PencilIcon,
  PencilRulerIcon,
  SearchIcon,
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
import {
  WorkflowFormDialog,
  WorkflowStatusBadge,
  workflowStatus,
} from "@/components/workflows"
import { WorkflowFilters } from "@/components/workflows/workflow-filters"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
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
import { WORKFLOW_STATUS_FILTERS } from "@/lib/workflow-status-filter"
import { SortableTableHead } from "@/components/workspace/sortable-table-head"
import { useTableSort } from "@/components/workspace/use-table-sort"

const workflowsSearchSchema = z.object({
  applicationId: z.uuid().optional(),
  status: z.enum(WORKFLOW_STATUS_FILTERS).optional(),
})

type WorkflowSortColumn = "workflow" | "application" | "status" | "updated"

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
  const {
    sorted: rows,
    sorts,
    onSort,
  } = useTableSort<WorkflowSummary, WorkflowSortColumn>(
    filtered,
    (workflow, column) =>
      workflowSortValue(
        workflow,
        column,
        applicationNameById.get(workflow.applicationId) ?? ""
      ),
    (left, right) => right.updatedAt.localeCompare(left.updatedAt)
  )
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
        <Button size="sm" {...shortcutTarget("create")}>
          Create workflow
          <ShortcutKeys id="create" onPrimary />
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
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4">
      <PageToolbar>
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder="Search workflows"
        />
        <WorkflowFilters
          applications={applications}
          values={{ applicationId, status: statusSearch }}
          onChange={(values) => void navigate({ search: values })}
        />
        {createDialog}
      </PageToolbar>
      {workflows.length === 0 ? (
        <Empty className="w-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>No workflows yet</EmptyTitle>
            <EmptyDescription>
              Create one inside an Application.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty className="w-auto">
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
        <Card className="min-h-0 gap-0 py-0">
          <Table stickyHeader>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <SortableTableHead
                  column="workflow"
                  label="Workflow"
                  sorts={sorts}
                  onSort={onSort}
                />
                <SortableTableHead
                  column="application"
                  label="Application"
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
                  <TableRow key={workflow.id}>
                    <TableCell className="px-4">
                      <Link
                        to="/w/$slug/workflows/$workflowId"
                        params={{ slug, workflowId: workflow.id }}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <PlayfulAvatar
                          name={workflow.name}
                          shape="rounded"
                          className="size-6"
                        />
                        <span className="truncate text-sm font-medium">
                          {workflow.name}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4">
                      <Link
                        to="/w/$slug/applications/$applicationId"
                        params={{
                          slug,
                          applicationId: workflow.applicationId,
                        }}
                        search={{ view: "workflows" }}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {applicationName}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4">
                      <WorkflowStatusBadge workflow={workflow} />
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground tabular-nums">
                      {formatDate(workflow.updatedAt)}
                    </TableCell>
                    <TableCell className="px-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
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
        </Card>
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
