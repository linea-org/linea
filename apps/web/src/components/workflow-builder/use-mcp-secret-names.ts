import { useQueries, useQuery } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"

import { listEnvironmentsFn } from "@/lib/environments-api"
import { listAiProvidersFn, listSecretsFn } from "@/lib/secrets-api"

export type McpSecretName = { name: string; missingIn: string[] }

/** Secret names (never values) across the Application's Environments. Model provider keys are
 * left out: the worker refuses to send them to an MCP server. */
export function useMcpSecretNames(applicationId: string | undefined) {
  const { slug } = useParams({ strict: false })
  const environments = useQuery({
    queryKey: ["environments", slug, applicationId],
    queryFn: () =>
      listEnvironmentsFn({ data: { applicationId: applicationId ?? "" } }),
    enabled: Boolean(applicationId),
  })
  const list = environments.data ?? []
  const secrets = useQueries({
    queries: list.map((environment) => ({
      queryKey: ["secrets", slug, environment.id],
      queryFn: () => listSecretsFn({ data: { environmentId: environment.id } }),
      retry: false,
    })),
  })
  const first = list[0]
  const providers = useQuery({
    queryKey: ["secrets", slug, first?.id, "providers"],
    queryFn: () =>
      listAiProvidersFn({ data: { environmentId: first?.id ?? "" } }),
    enabled: Boolean(first),
    retry: false,
  })
  const error =
    environments.error ??
    secrets.find((query) => query.error)?.error ??
    providers.error
  const pending =
    environments.isPending ||
    providers.isPending ||
    secrets.some((query) => query.isPending)
  const modelKeys = new Set(
    (providers.data ?? []).map((provider) => provider.keyName)
  )
  const byEnvironment = list.map((environment, index) => ({
    label: environment.displayName,
    keys: new Set((secrets[index]?.data ?? []).map((secret) => secret.key)),
  }))
  const names = [...new Set(byEnvironment.flatMap(({ keys }) => [...keys]))]
    .filter((name) => !modelKeys.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map(
      (name): McpSecretName => ({
        name,
        missingIn: byEnvironment
          .filter(({ keys }) => !keys.has(name))
          .map(({ label }) => label),
      })
    )
  return { names, error, pending: Boolean(applicationId) && pending }
}
