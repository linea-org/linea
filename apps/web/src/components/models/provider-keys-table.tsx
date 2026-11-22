import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { EllipsisIcon, KeyRoundIcon, Trash2Icon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@linealabs/ui/components/alert-dialog"
import { Badge } from "@linealabs/ui/components/badge"
import { Button } from "@linealabs/ui/components/button"
import { Card } from "@linealabs/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linealabs/ui/components/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"

import {
  ProviderKeysToolbar,
  type ProviderStatusFilter,
} from "./provider-keys-toolbar"
import { SecretFormDialog } from "@/components/secrets/secret-form-dialog"
import { findOrCreateDevelopmentEnvironment } from "@/lib/default-application"
import {
  modelSetupKey,
  type CatalogModel,
  type ModelSetup,
} from "@/lib/model-settings-api"
import {
  deleteSecretFn,
  upsertSecretFn,
  type AiProviderKeyStatus,
} from "@/lib/secrets-api"

const SHOWN_MODELS = 2

function ModelSummary({ models }: Readonly<{ models: CatalogModel[] }>) {
  const shown = models.slice(0, SHOWN_MODELS)
  const rest = models.slice(SHOWN_MODELS)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate">
        {shown.map((model) => model.label).join(", ")}
      </span>
      {rest.length > 0 ? (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="secondary" />}>
            +{rest.length}
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col py-1">
              {rest.map((model) => (
                <span key={model.value}>{model.label}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

function ProviderStatus({
  provider,
}: Readonly<{ provider: AiProviderKeyStatus }>) {
  if (provider.configured) return <Badge variant="success">Connected</Badge>
  if (provider.platformFallback) {
    return <Badge variant="outline">Platform key</Badge>
  }
  return <span className="text-muted-foreground">Not connected</span>
}

function ProviderRow({
  provider,
  models,
  onEdit,
  onRemove,
}: Readonly<{
  provider: AiProviderKeyStatus
  models: CatalogModel[]
  onEdit: () => void
  onRemove: () => void
}>) {
  return (
    <TableRow>
      <TableCell className="font-medium">{provider.label}</TableCell>
      <TableCell className="max-w-0 text-muted-foreground">
        <ModelSummary models={models} />
      </TableCell>
      <TableCell>
        <ProviderStatus provider={provider} />
      </TableCell>
      <TableCell className="text-right">
        {provider.configured ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${provider.label} key options`}
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={onEdit}>
                <KeyRoundIcon />
                Replace key
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                <Trash2Icon />
                Remove key
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Add key
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

export function ProviderKeysTable({
  slug,
  setup,
}: Readonly<{
  slug: string
  setup: ModelSetup
}>) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AiProviderKeyStatus | null>(null)
  const [removing, setRemoving] = useState<AiProviderKeyStatus | null>(null)
  const [status, setStatus] = useState<ProviderStatusFilter>("all")
  const providers = setup.providers.filter(
    (provider) =>
      status === "all" || (status === "connected") === provider.configured
  )
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: modelSetupKey(slug),
    })
  const remove = useMutation({
    mutationFn: async (provider: AiProviderKeyStatus) => {
      const environment = await findOrCreateDevelopmentEnvironment()
      await deleteSecretFn({
        data: { environmentId: environment.id, key: provider.keyName },
      })
    },
    onSuccess: async () => {
      setRemoving(null)
      await refresh()
    },
  })
  return (
    <>
      <ProviderKeysToolbar
        status={status}
        onStatusChange={setStatus}
        unconnected={setup.providers.filter((provider) => !provider.configured)}
        onAdd={setEditing}
      />
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-normal text-muted-foreground">
                Provider
              </TableHead>
              <TableHead className="font-normal text-muted-foreground">
                Models
              </TableHead>
              <TableHead className="font-normal text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                models={setup.settings.models.filter(
                  (model) => model.keyName === provider.keyName
                )}
                onEdit={() => setEditing(provider)}
                onRemove={() => setRemoving(provider)}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.label} key?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.label} models stop working without it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <p className="text-sm text-destructive">{remove.error.message}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (removing) remove.mutate(removing)
              }}
            >
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SecretFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={`${editing?.label ?? ""} API key`}
        submitLabel="Save key"
        nameField="locked"
        initialName={editing?.keyName ?? ""}
        onSubmit={async ({ secret }) => {
          if (!editing) throw new Error("No provider selected")
          const environment = await findOrCreateDevelopmentEnvironment()
          await upsertSecretFn({
            data: {
              environmentId: environment.id,
              key: editing.keyName,
              value: secret,
            },
          })
          await refresh()
        }}
      />
    </>
  )
}
