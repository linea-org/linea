import { useQuery } from "@tanstack/react-query"

import { listDeploymentsFn } from "@/lib/deployments-api"
import { authClient } from "@/lib/auth-client"
import { listEnvironmentsFn } from "@/lib/environments-api"
import { isWorkspaceAdmin } from "@/lib/workspace-role"
import type { WorkflowSummary } from "@/lib/workflows-api"

/** Whether a workspace key can start this Workflow: the API runs the version deployed to Dev,
 * and only when Dev is enabled and that deployment allows backend starts. Deployments are
 * admin-only, so for members `deployed` is null (unknown) rather than false. */
export function useCallReadiness(slug: string, workflow: WorkflowSummary) {
  const { data: session } = authClient.useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const admin = isWorkspaceAdmin(
    activeOrganization?.members ?? [],
    session?.user.id
  )
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
    enabled: admin && Boolean(dev),
  })
  const devEnabled = dev?.enabled ?? true
  const deployed = admin
    ? Boolean(
        devEnabled &&
        deployments.data?.some(
          (binding) =>
            binding.workflowId === workflow.id &&
            binding.enabled &&
            binding.allowBackendStart
        )
      )
    : null
  return {
    pending:
      environments.isPending ||
      (admin && Boolean(dev) && deployments.isPending),
    admin,
    published: Boolean(workflow.publishedVersionId),
    deployed,
    devEnabled,
    error: environments.error ?? deployments.error,
  }
}
