import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { Button, buttonVariants } from "@linealabs/ui/components/button"

import { SecretFormDialog } from "@/components/secrets/secret-form-dialog"
import { getDevelopmentEnvironment } from "@/lib/default-application"
import type { ExecutionDetailResponse } from "@/lib/executions-api"
import { modelSetupKey, modelSetupQueryOptions } from "@/lib/model-settings-api"
import { readableProviderError } from "@/lib/provider-error"
import { failedKeyName, runFailureFix } from "@/lib/run-failure"
import { upsertSecretFn } from "@/lib/secrets-api"

export function RunFailureNotice({
  slug,
  applicationId,
  detail,
  onKeySaved,
}: Readonly<{
  slug: string
  applicationId: string | undefined
  detail: ExecutionDetailResponse
  onKeySaved?: () => void
}>) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const { error } = detail.execution
  const message = error?.message ?? "This run failed."
  const fix = runFailureFix(message)
  const keyFix = fix?.to === "models" ? fix : null
  const { data: setup, isPending } = useQuery({
    ...modelSetupQueryOptions(slug, applicationId),
    enabled: keyFix !== null && applicationId !== undefined,
  })
  const model = error?.stepId ? detail.nodeConfigs[error.stepId]?.model : null
  const keyName = failedKeyName(message, model, setup?.settings.models ?? [])
  const provider = setup?.providers.find((item) => item.keyName === keyName)

  let action = null
  if (keyFix && provider)
    action = (
      <Button
        type="button"
        variant="link"
        className="px-0"
        onClick={() => setEditing(true)}
      >
        {keyFix.label}
      </Button>
    )
  else if (keyFix && !(applicationId && isPending))
    action = (
      <Link
        to="/w/$slug/settings/models"
        params={{ slug }}
        className={buttonVariants({ variant: "link", className: "px-0" })}
      >
        {keyFix.label}
      </Link>
    )
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-sm text-destructive">
      <span>{readableProviderError(message)?.summary ?? message}</span>
      {action}
      {applicationId && provider ? (
        <SecretFormDialog
          open={editing}
          onOpenChange={setEditing}
          title={`${provider.label} API key`}
          submitLabel="Save key"
          nameField="none"
          initialName={provider.keyName}
          onSubmit={async ({ secret }) => {
            const environment = await getDevelopmentEnvironment(applicationId)
            await upsertSecretFn({
              data: {
                environmentId: environment.id,
                key: provider.keyName,
                value: secret,
              },
            })
            await queryClient.invalidateQueries({
              queryKey: modelSetupKey(slug),
            })
            onKeySaved?.()
          }}
        />
      ) : null}
    </div>
  )
}
