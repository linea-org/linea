import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"

import { SecretFormDialog } from "@/components/secrets/secret-form-dialog"
import { findOrCreateDevelopmentEnvironment } from "@/lib/default-application"
import {
  modelSetupQueryOptions,
  type ModelSetup,
} from "@/lib/model-settings-api"
import {
  deleteSecretFn,
  upsertSecretFn,
  type AiProviderKeyStatus,
} from "@/lib/secrets-api"

export function ProviderKeysCard({
  slug,
  setup,
}: {
  slug: string
  setup: ModelSetup
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AiProviderKeyStatus | null>(null)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: modelSetupQueryOptions(slug).queryKey,
    })
  const remove = useMutation({
    mutationFn: async (provider: AiProviderKeyStatus) => {
      const environment = await findOrCreateDevelopmentEnvironment()
      await deleteSecretFn({
        data: { environmentId: environment.id, key: provider.keyName },
      })
    },
    onSuccess: refresh,
  })
  return (
    <>
      <Card className="gap-0 py-0">
        <ul className="divide-y divide-border">
          {setup.providers.map((provider) => (
            <li key={provider.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{provider.label}</p>
              </div>
              <Badge variant={provider.configured ? "success" : "outline"}>
                {provider.configured ? "Key added" : "No key"}
              </Badge>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setEditing(provider)}
              >
                {provider.configured ? "Replace key" : "Add key"}
              </Button>
              {provider.configured ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(provider)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      {remove.isError ? (
        <p className="text-xs text-destructive">{remove.error.message}</p>
      ) : null}
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
