import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon, WorkflowIcon } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"
import { Button } from "@linealabs/ui/components/button"
import { Card } from "@linealabs/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"
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
        <Button>
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
        <Empty className="w-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>No Workflows yet</EmptyTitle>
            <EmptyDescription>Create one to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {workflows.length > 0 && (
        <div>
          <Card className="gap-0 py-0">
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
                  <TableRow key={workflow.id}>
                    <TableCell className="px-4">
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
                          className="size-6"
                        />
                        <span className="truncate text-sm font-medium">
                          {workflow.name}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground">
                      {workflowStatus(workflow)}
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground tabular-nums">
                      {formatDate(workflow.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </section>
  )
}
