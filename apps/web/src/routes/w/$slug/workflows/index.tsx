import { useMemo, useState } from "react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@linea/ui/components/input-group"
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
  WorkflowFormDialog,
  WorkflowStatusBadge,
  workflowStatus,
} from "../../../../components/workflows"
import {
  createWorkflowFn,
  listWorkflowsFn,
  updateWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "../../../../lib/workflows-api"

const STATUS_FILTERS = ["Draft", "Published", "Archived"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter)
}

export const Route = createFileRoute("/w/$slug/workflows/")({
  loader: () => listWorkflowsFn(),
  component: WorkflowsListPage,
})

function WorkflowsListPage() {
  const { slug } = Route.useParams()
  const initialData = Route.useLoaderData()
  const { data: workflows } = useSuspenseQuery({
    ...workflowsQueryOptions(slug),
    initialData,
  })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingWorkflow, setEditingWorkflow] =
    useState<WorkflowSummary | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | StatusFilter>("all")
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return workflows.filter((workflow) => {
      if (status !== "all" && workflowStatus(workflow) !== status) return false
      if (!query) return true
      return (
        workflow.name.toLowerCase().includes(query) ||
        workflow.slug.toLowerCase().includes(query)
      )
    })
  }, [workflows, search, status])
  function goToBuilder(workflow: { id: string }) {
    return navigate({
      to: "/w/$slug/workflows/$workflowId/builder",
      params: { slug, workflowId: workflow.id },
    })
  }
  async function onWorkflowSaved() {
    await queryClient.invalidateQueries({
      queryKey: workflowsQueryOptions(slug).queryKey,
    })
  }
  const createDialog = (
    <WorkflowFormDialog
      trigger={
        <Button size="sm">
          <PlusIcon />
          Create workflow
        </Button>
      }
      title="Create workflow"
      submitLabel="Create workflow"
      onSubmit={(values) => createWorkflowFn({ data: values })}
      onSuccess={goToBuilder}
    />
  )
  return (
    <main className="flex flex-1 flex-col px-6 py-6 sm:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 max-w-sm rounded-lg border-input/30 bg-input/30 shadow-none">
          <InputGroupAddon>
            <SearchIcon className="size-4 shrink-0 opacity-50" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search workflows"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select
          value={status}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            if (value === "all" || isStatusFilter(value)) {
              setStatus(value)
              return
            }
            setStatus("all")
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Status">
              {(value: string) => (value === "all" ? "All statuses" : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter} value={filter}>
                {filter}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">{createDialog}</div>
      </div>
      {workflows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>No workflows yet</EmptyTitle>
            <EmptyDescription>
              Workflows created for this workspace will show up here.
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
              Try a different search or status filter.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4">Name</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Updated</TableHead>
                <TableHead className="w-12 px-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((workflow) => (
                <TableRow key={workflow.id}>
                  <TableCell className="px-4 py-3">
                    <Link
                      to="/w/$slug/workflows/$workflowId"
                      params={{ slug, workflowId: workflow.id }}
                      className="block min-w-0"
                    >
                      <span className="block truncate font-medium text-foreground hover:underline">
                        {workflow.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {workflow.slug}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <WorkflowStatusBadge workflow={workflow} />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {new Date(workflow.updatedAt).toLocaleDateString()}
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editingWorkflow && (
        <WorkflowFormDialog
          open
          onOpenChange={(open) => !open && setEditingWorkflow(null)}
          title="Edit workflow"
          submitLabel="Save"
          defaultValues={{
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
