import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon, WorkflowIcon, PencilRulerIcon } from "lucide-react"
import { Button, buttonVariants } from "@linea/ui/components/button"
import { WorkflowFormDialog, WorkflowStatusBadge } from "@/components/workflows"
import {
  createWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"

export function ApplicationWorkflows({
  workspaceSlug,
  applicationId,
  workflows,
}: {
  workspaceSlug: string
  applicationId: string
  workflows: WorkflowSummary[]
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (
    <section
      aria-label="Application Workflows"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <WorkflowIcon className="size-4" />
            Workflows
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a process, publish a version, and deploy it to an Environment.
          </p>
        </div>
        <WorkflowFormDialog
          workspaceSlug={workspaceSlug}
          trigger={
            <Button size="sm">
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
                queryKey: [
                  "application-workflows",
                  workspaceSlug,
                  applicationId,
                ],
              }),
              queryClient.invalidateQueries(
                workflowsQueryOptions(workspaceSlug)
              ),
            ])
            await navigate({
              to: "/w/$slug/workflows/$workflowId/builder",
              params: { slug: workspaceSlug, workflowId: workflow.id },
            })
          }}
        />
      </div>
      {workflows.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No Workflows in this Application yet. Create one to open the builder.
        </p>
      )}
      {workflows.map((workflow) => (
        <article
          key={workflow.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
        >
          <Link
            to="/w/$slug/workflows/$workflowId"
            params={{ slug: workspaceSlug, workflowId: workflow.id }}
            className="min-w-0 basis-full hover:underline sm:flex-1 sm:basis-auto"
          >
            <h3 className="font-medium break-words">{workflow.name}</h3>
            <p className="truncate text-sm text-muted-foreground">
              {workflow.description || workflow.slug}
            </p>
          </Link>
          <WorkflowStatusBadge workflow={workflow} />
          <Link
            to="/w/$slug/workflows/$workflowId/builder"
            params={{ slug: workspaceSlug, workflowId: workflow.id }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <PencilRulerIcon />
            Open builder
          </Link>
        </article>
      ))}
    </section>
  )
}
