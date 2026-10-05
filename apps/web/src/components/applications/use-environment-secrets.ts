import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  deleteSecretFn,
  listAiProvidersFn,
  listSecretsFn,
  upsertSecretFn,
} from "@/lib/secrets-api"

export type SecretEditor =
  | { kind: "create" }
  | { kind: "replace"; name: string }
  | { kind: "provider"; name: string; label: string; configured: boolean }

export function isForbidden(error: Error) {
  return error.message.toLowerCase().includes("admin")
}

export function useEnvironmentSecrets(
  workspaceSlug: string,
  environmentId: string
) {
  const secretsQueryKey = ["secrets", workspaceSlug, environmentId]
  const aiProvidersQueryKey = [
    "secrets",
    workspaceSlug,
    environmentId,
    "providers",
  ]
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [editor, setEditor] = useState<SecretEditor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    name: string
    label: string
  } | null>(null)
  const {
    data: providers,
    isPending: providersPending,
    isError: providersErrored,
    error: providersError,
  } = useQuery({
    queryKey: aiProvidersQueryKey,
    queryFn: () => listAiProvidersFn({ data: { environmentId } }),
    retry: false,
  })
  const {
    data: secrets,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: secretsQueryKey,
    queryFn: () => listSecretsFn({ data: { environmentId } }),
    retry: false,
  })
  const forbidden = isError && isForbidden(error)
  const providerKeys = useMemo(
    () => new Set((providers ?? []).map((provider) => provider.keyName)),
    [providers]
  )
  const customSecrets = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (secrets ?? []).filter((secret) => {
      if (providerKeys.has(secret.key)) return false
      if (!query) return true
      return secret.key.toLowerCase().includes(query)
    })
  }, [secrets, providerKeys, search])
  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: aiProvidersQueryKey }),
      queryClient.invalidateQueries({ queryKey: secretsQueryKey }),
    ])
  }
  const save = useMutation({
    mutationFn: (input: { name: string; secret: string }) =>
      upsertSecretFn({
        data: { environmentId, key: input.name, value: input.secret },
      }),
    onSuccess: () => invalidate(),
  })
  const remove = useMutation({
    mutationFn: (name: string) =>
      deleteSecretFn({ data: { environmentId, key: name } }),
    onSuccess: async () => {
      setDeleteTarget(null)
      await invalidate()
    },
  })
  return {
    search,
    setSearch,
    editor,
    setEditor,
    deleteTarget,
    setDeleteTarget,
    providers,
    providersPending,
    providersErrored,
    providersError,
    isPending,
    isError,
    error,
    forbidden,
    customSecrets,
    save,
    remove,
  }
}
