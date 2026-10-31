import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { PlayfulAvatar } from "@/components/avatar"
import { WorkflowFormDialog, workflowStatus } from "@/components/workflows"
import {
  createWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"

export function ApplicationWorkflowCreateButton({
  workspaceSlug,
  applicationId,
}: {
  workspaceSlug: string
  applicationId: string
}) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

export function ApplicationWorkflows({
  workspaceSlug,
  workflows,
}: {
  workspaceSlug: string
  workflows: WorkflowSummary[]
}) {
  return (
    <section aria-label="Application Workflows" className="flex flex-col">
      {workflows.length === 0 && (
        <p className="px-4 py-8 text-xs text-muted-foreground">
          No Workflows in this Application yet.
        </p>
      )}
      {workflows.length > 0 && (
        <div className="divide-y divide-border/70 border-b border-border/70">
          {workflows.map((workflow) => (
            <Link
              key={workflow.id}
              to="/w/$slug/workflows/$workflowId"
              params={{ slug: workspaceSlug, workflowId: workflow.id }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <PlayfulAvatar
                name={workflow.name}
                shape="rounded"
                className="size-8"
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{workflow.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {workflow.slug}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span>{workflowStatus(workflow)}</span>
                <span className="tabular-nums">
                  {formatDate(workflow.updatedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
