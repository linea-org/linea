import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  KeyIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@linea/ui/components/alert-dialog"
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@linea/ui/components/input-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import { SecretFormDialog } from "@/components/secrets"
import {
  deleteSecretFn,
  listAiProvidersFn,
  listSecretsFn,
  upsertSecretFn,
  type AiProviderKeyStatus,
} from "@/lib/secrets-api"

export const Route = createFileRoute("/w/$slug/settings/secrets")({
  component: SecretsPage,
})

const secretsQueryKey = ["secrets"]
const aiProvidersQueryKey = ["secrets", "providers"]

type SecretEditor =
  | { kind: "create" }
  | { kind: "replace"; name: string }
  | { kind: "provider"; name: string; label: string; configured: boolean }

function isForbidden(error: Error) {
  return error.message.toLowerCase().includes("admin")
}

function editorNameField(
  editor: SecretEditor | null
): "open" | "locked" | "none" {
  if (!editor) return "none"
  switch (editor.kind) {
    case "create":
      return "open"
    case "replace":
      return "locked"
    case "provider":
      return "none"
    default: {
      const exhaustive: never = editor
      return exhaustive
    }
  }
}

function editorTitle(editor: SecretEditor) {
  switch (editor.kind) {
    case "create":
      return "Add secret"
    case "replace":
      return "Replace secret"
    case "provider":
      return editor.configured
        ? `Replace ${editor.label}`
        : `Add ${editor.label}`
    default: {
      const exhaustive: never = editor
      return exhaustive
    }
  }
}

function SecretsPage() {
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
    queryFn: () => listAiProvidersFn(),
    retry: false,
  })
  const {
    data: secrets,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: secretsQueryKey,
    queryFn: () => listSecretsFn(),
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
      upsertSecretFn({ data: { key: input.name, value: input.secret } }),
    onSuccess: () => invalidate(),
  })
  const remove = useMutation({
    mutationFn: (name: string) => deleteSecretFn({ data: { key: name } }),
    onSuccess: async () => {
      setDeleteTarget(null)
      await invalidate()
    },
  })
  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      {forbidden ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyIcon />
            </EmptyMedia>
            <EmptyTitle>Admins only</EmptyTitle>
            <EmptyDescription>
              Ask a workspace admin to manage secrets.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="pl-1 text-sm font-medium text-foreground">
            AI providers
          </p>
          <p className="mt-1 pl-1 text-xs text-muted-foreground">
            Use your own account for models, or keep Linea&apos;s default.
          </p>
          {providersErrored && !isForbidden(providersError) ? (
            <p className="mt-4 text-xs text-destructive">
              {providersError.message}
            </p>
          ) : null}
          {providersPending ? (
            <p className="mt-4 text-xs text-muted-foreground">Loading…</p>
          ) : providers ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">Provider</TableHead>
                    <TableHead className="px-4">Source</TableHead>
                    <TableHead className="w-12 px-2">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <ProviderRow
                      key={provider.id}
                      provider={provider}
                      onEdit={() =>
                        setEditor({
                          kind: "provider",
                          name: provider.keyName,
                          label: provider.label,
                          configured: provider.configured,
                        })
                      }
                      onRemove={() =>
                        setDeleteTarget({
                          name: provider.keyName,
                          label: provider.label,
                        })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <div className="mt-8 mb-4 flex flex-wrap items-center gap-2 pl-1">
            <InputGroup className="h-8 max-w-sm rounded-lg border-input/30 bg-input/30 shadow-none">
              <InputGroupAddon>
                <SearchIcon className="size-4 shrink-0 opacity-50" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search secrets"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            <div className="ml-auto">
              <Button size="sm" onClick={() => setEditor({ kind: "create" })}>
                <PlusIcon />
                Add secret
              </Button>
            </div>
          </div>
          {isError && !forbidden ? (
            <p className="text-xs text-destructive">{error.message}</p>
          ) : isPending ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : customSecrets.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {search.trim() ? <SearchIcon /> : <KeyIcon />}
                </EmptyMedia>
                <EmptyTitle>
                  {search.trim() ? "No matching secrets" : "No secrets yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {search.trim()
                    ? "Try a different search."
                    : "Credentials for integrations, like an HTTP header a workflow needs."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">Name</TableHead>
                    <TableHead className="px-4">Secret</TableHead>
                    <TableHead className="px-4">Updated</TableHead>
                    <TableHead className="w-12 px-2">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customSecrets.map((secret) => (
                    <TableRow key={secret.id}>
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        {secret.key}
                      </TableCell>
                      <TableCell className="px-4 py-3 tracking-widest text-muted-foreground">
                        ••••••••
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {new Date(secret.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-2 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`More options for ${secret.key}`}
                              />
                            }
                          >
                            <EllipsisVerticalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 min-w-48"
                          >
                            <DropdownMenuItem
                              onClick={() =>
                                setEditor({
                                  kind: "replace",
                                  name: secret.key,
                                })
                              }
                            >
                              <PencilIcon />
                              Replace
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setDeleteTarget({
                                  name: secret.key,
                                  label: secret.key,
                                })
                              }
                            >
                              <Trash2Icon />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
      <SecretFormDialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
        title={editor ? editorTitle(editor) : "Add secret"}
        submitLabel="Save"
        nameField={editorNameField(editor)}
        initialName={editor && editor.kind !== "create" ? editor.name : ""}
        onSubmit={(input) => save.mutateAsync(input)}
      />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Workflows using this credential will fail until it&apos;s added
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget.name)}
              disabled={remove.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function ProviderRow({
  provider,
  onEdit,
  onRemove,
}: {
  provider: AiProviderKeyStatus
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <TableRow>
      <TableCell className="px-4 py-3 font-medium text-foreground">
        {provider.label}
      </TableCell>
      <TableCell className="px-4 py-3">
        <Badge variant={provider.configured ? "default" : "secondary"}>
          {provider.configured ? "This workspace" : "Linea default"}
        </Badge>
      </TableCell>
      <TableCell className="px-2 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`More options for ${provider.label}`}
              />
            }
          >
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 min-w-48">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon />
              {provider.configured ? "Replace" : "Add"}
            </DropdownMenuItem>
            {provider.configured ? (
              <DropdownMenuItem onClick={onRemove}>
                <Trash2Icon />
                Remove
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}
