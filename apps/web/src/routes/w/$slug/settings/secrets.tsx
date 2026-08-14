import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { KeyIcon, Trash2Icon } from "lucide-react"

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
import { Button } from "@linea/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@linea/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import {
  deleteSecretFn,
  listSecretsFn,
  upsertSecretFn,
} from "../../../../lib/secrets-api"

export const Route = createFileRoute("/w/$slug/settings/secrets")({
  component: SecretsPage,
})

const secretsQueryKey = ["secrets"]

function SecretsPage() {
  const queryClient = useQueryClient()
  const [key, setKey] = useState("")
  const [value, setValue] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

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

  const save = useMutation({
    mutationFn: () => upsertSecretFn({ data: { key, value } }),
    onSuccess: async () => {
      setKey("")
      setValue("")
      await queryClient.invalidateQueries({ queryKey: secretsQueryKey })
    },
  })

  const remove = useMutation({
    mutationFn: (targetKey: string) =>
      deleteSecretFn({ data: { key: targetKey } }),
    onSuccess: async () => {
      setDeleteTarget(null)
      await queryClient.invalidateQueries({ queryKey: secretsQueryKey })
    },
  })

  const forbidden = isError && error.message.toLowerCase().includes("admin")

  return (
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Secrets
      </h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Workspace credentials for AI providers and other integrations. A key
        here overrides the platform default for every workflow in this workspace
        — for example, set ANTHROPIC_API_KEY to use your own Anthropic account
        instead of Linea&apos;s.
      </p>

      {isError && !forbidden && (
        <p className="mt-4 text-sm text-destructive">{error.message}</p>
      )}

      {forbidden ? (
        <Empty className="mt-8">
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
          <Card className="mt-8 max-w-lg">
            <CardHeader>
              <CardTitle>Add or update a key</CardTitle>
              <CardDescription>
                Values are encrypted at rest and never shown again after saving.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (key.trim() && value.trim()) save.mutate()
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="secret-key">Key</FieldLabel>
                    <Input
                      id="secret-key"
                      placeholder="ANTHROPIC_API_KEY"
                      value={key}
                      onChange={(e) => setKey(e.target.value.toUpperCase())}
                      required
                    />
                    <FieldDescription>
                      Upper snake case, matching the provider&apos;s env var
                      name.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="secret-value">Value</FieldLabel>
                    <Input
                      id="secret-value"
                      type="password"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      required
                    />
                  </Field>
                </FieldGroup>
                {save.isError && (
                  <p className="mt-3 text-sm text-destructive">
                    {save.error.message}
                  </p>
                )}
                <Button
                  type="submit"
                  className="mt-4"
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Configured keys</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : secrets && secrets.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {secrets.map((secret) => (
                      <TableRow key={secret.id}>
                        <TableCell className="font-mono text-sm text-foreground">
                          {secret.key}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(secret.updatedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${secret.key}`}
                            onClick={() => setDeleteTarget(secret.key)}
                          >
                            <Trash2Icon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No keys configured yet — workflows use Linea&apos;s platform
                  default keys.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget}?</AlertDialogTitle>
            <AlertDialogDescription>
              Workflows in this workspace will fall back to Linea&apos;s
              platform default key, if one exists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
              disabled={remove.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
