import { useQuery } from "@tanstack/react-query"

import { listDeploymentsFn } from "@/lib/deployments-api"
import { listEnvironmentsFn } from "@/lib/environments-api"
import type { WorkflowSummary } from "@/lib/workflows-api"

/** Whether a workspace key can start this Workflow: the API runs the version deployed to Dev,
 * and only when that deployment allows backend starts. */
export function useCallReadiness(slug: string, workflow: WorkflowSummary) {
  const environments = useQuery({
    queryKey: ["environments", slug, workflow.applicationId],
    queryFn: () =>
      listEnvironmentsFn({ data: { applicationId: workflow.applicationId } }),
  })
  const dev = environments.data?.find(
    (environment) => environment.environment === "dev"
  )
  const deployments = useQuery({
    queryKey: ["deployments", slug, dev?.id],
    queryFn: () =>
      listDeploymentsFn({ data: { environmentId: dev?.id ?? "" } }),
    enabled: Boolean(dev),
  })
  const deployed = Boolean(
    deployments.data?.some(
      (binding) =>
        binding.workflowId === workflow.id &&
        binding.enabled &&
        binding.allowBackendStart
    )
  )
  return {
    pending: environments.isPending || (Boolean(dev) && deployments.isPending),
    published: Boolean(workflow.publishedVersionId),
    deployed,
  }
}
