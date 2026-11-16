import { useQuery } from "@tanstack/react-query"
import { EnvironmentDeploymentForm } from "./environment-deployment-form"
import { listDeploymentsFn } from "@/lib/deployments-api"
import type { WorkflowSummary } from "@/lib/workflows-api"
import { Card } from "@linea/ui/components/card"

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
    <section className="flex flex-col gap-3">
      {deployments.map((deployment) => (
        <Card key={deployment.id} className="block p-2">
          {workflows.find((workflow) => workflow.id === deployment.workflowId)
            ?.name ?? "Workflow"}{" "}
          · {deployment.enabled ? "Enabled" : "Disabled"}
          <p className="text-sm text-muted-foreground">
            Pinned version: {deployment.workflowVersionId}
          </p>
        </Card>
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
