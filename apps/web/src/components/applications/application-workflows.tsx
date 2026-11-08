import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"
import { PlayfulAvatar } from "@/components/avatar"
import { WorkflowFormDialog, workflowStatus } from "@/components/workflows"
import {
  createWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"
import { formatDate } from "@/lib/format"

export function ApplicationWorkflowCreateButton({
  workspaceSlug,
  applicationId,
}: Readonly<{
  workspaceSlug: string
  applicationId: string
}>) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (
    <WorkflowFormDialog
      workspaceSlug={workspaceSlug}
      trigger={
        <Button size="xs">
          <PlusIcon />
          Create Workflow
        </Button>
      }
      title="Create Workflow"
      submitLabel="Create Workflow"
      defaultValues={{ applicationId, name: "", slug: "", description: "" }}
      onSubmit={(values) =>
        createWorkflowFn({ data: { ...values, applicationId } })
      }
      onSuccess={async (workflow) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["application-workflows", workspaceSlug, applicationId],
          }),
          queryClient.invalidateQueries(workflowsQueryOptions(workspaceSlug)),
        ])
        await navigate({
          to: "/w/$slug/workflows/$workflowId/builder",
          params: { slug: workspaceSlug, workflowId: workflow.id },
        })
      }}
    />
  )
}

export function ApplicationWorkflows({
  workspaceSlug,
  workflows,
}: Readonly<{
  workspaceSlug: string
  workflows: WorkflowSummary[]
}>) {
  return (
    <section aria-label="Application Workflows" className="flex flex-col">
      {workflows.length === 0 && (
        <p className="px-4 py-8 text-xs text-muted-foreground">
          No Workflows in this Application yet.
        </p>
      )}
      {workflows.length > 0 && (
        <div className="px-4 py-2">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Workflow
                  </TableHead>
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((workflow) => (
                  <TableRow key={workflow.id} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3">
                      <Link
                        to="/w/$slug/workflows/$workflowId"
                        params={{
                          slug: workspaceSlug,
                          workflowId: workflow.id,
                        }}
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
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {workflowStatus(workflow)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                      {formatDate(workflow.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  )
}
