import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon, WorkflowIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import {
  createWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"
import { WorkflowFormDialog, WorkflowStatusBadge } from "../workflows"
import { HomePanel } from "./home-panel"

export function WorkflowsWidget({
  slug,
  workflows,
}: {
  slug: string
  workflows: WorkflowSummary[]
}) {
  const recent = workflows.slice(0, 6)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createDialog = (
    <WorkflowFormDialog
      trigger={
        <Button size="sm">
          <PlusIcon />
          Create
        </Button>
      }
      title="Create workflow"
      submitLabel="Create workflow"
      onSubmit={(values) => createWorkflowFn({ data: values })}
      onSuccess={(workflow) => {
        void queryClient.invalidateQueries({
          queryKey: workflowsQueryOptions(slug).queryKey,
        })
        return navigate({
          to: "/w/$slug/workflows/$workflowId/builder",
          params: { slug, workflowId: workflow.id },
        })
      }}
    />
  )
  return (
    <HomePanel
      title="Workflows"
      action={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/w/$slug/workflows" params={{ slug }} />}
          >
            View all
          </Button>
          {createDialog}
        </div>
      }
    >
      {recent.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>No workflows yet</EmptyTitle>
            <EmptyDescription>
              Create your first workflow to get started.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Name</TableHead>
              <TableHead className="px-4">Status</TableHead>
              <TableHead className="px-4">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((workflow) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </HomePanel>
  )
}
