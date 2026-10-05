import { useQuery } from "@tanstack/react-query"
import { EnvironmentDeploymentForm } from "./environment-deployment-form"
import { listDeploymentsFn } from "@/lib/deployments-api"
import type { WorkflowSummary } from "@/lib/workflows-api"

export function EnvironmentDeployments({
  workspaceSlug,
  environmentId,
  workflows,
  enabled,
}: {
  workspaceSlug: string
  environmentId: string
  workflows: WorkflowSummary[]
  enabled: boolean
}) {
  const { data: deployments = [], error } = useQuery({
    queryKey: ["deployments", workspaceSlug, environmentId],
    queryFn: () => listDeploymentsFn({ data: { environmentId } }),
  })
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3 className="font-medium">Workflow deployments</h3>
      <p className="text-sm text-muted-foreground">
        Publish in the builder, then deploy an exact version. Updating this
        Environment does not change the other one.
      </p>
      {deployments.map((deployment) => (
        <div key={deployment.id} className="rounded-lg border p-2 text-sm">
          {workflows.find((workflow) => workflow.id === deployment.workflowId)
            ?.name ?? "Workflow"}{" "}
          · {deployment.enabled ? "Enabled" : "Disabled"}
          <p className="text-xs text-muted-foreground">
            Pinned version: {deployment.workflowVersionId}
          </p>
        </div>
      ))}
      <EnvironmentDeploymentForm
        workspaceSlug={workspaceSlug}
        environmentId={environmentId}
        workflows={workflows}
        enabled={enabled}
      />
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </section>
  )
}
