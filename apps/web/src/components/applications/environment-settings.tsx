import { EnvironmentConnections } from "./environment-connections"
import { useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Field, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  disableEnvironmentFn,
  updateEnvironmentRetentionFn,
  type EnvironmentSummary,
} from "@/lib/environments-api"
import type { WorkflowSummary } from "@/lib/workflows-api"
import { EnvironmentDeployments } from "./environment-deployments"
import { EnvironmentSecrets } from "./environment-secrets"
import { EnvironmentKeys } from "./environment-keys"
import { EnvironmentTrustForm } from "./environment-trust-form"

export function EnvironmentSettings({
  workspaceSlug,
  environment,
  workflows,
  onSaved,
}: {
  workspaceSlug: string
  workflows: WorkflowSummary[]
  environment: EnvironmentSummary
  onSaved: () => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ contentRetentionDays: number }>({
    defaultValues: { contentRetentionDays: environment.contentRetentionDays },
  })
  const retention = useMutation({
    mutationFn: (data: { contentRetentionDays: number }) =>
      updateEnvironmentRetentionFn({
        data: { ...data, environmentId: environment.id },
      }),
    onSuccess: onSaved,
  })
  const disable = useMutation({
    mutationFn: () =>
      disableEnvironmentFn({ data: { environmentId: environment.id } }),
    onSuccess: onSaved,
  })
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-semibold">
          {environment.environment === "dev" ? "Development" : "Production"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {environment.enabled ? "Enabled" : "Disabled"} ·{" "}
          {environment.oidcIssuer
            ? "Identity trust configured"
            : "Identity trust pending"}
        </p>
        <p className="font-mono text-xs break-all text-muted-foreground">
          {environment.id}
        </p>
      </div>
      <EnvironmentTrustForm environment={environment} onSaved={onSaved} />
      <form
        onSubmit={(event) => {
          void handleSubmit((data) => retention.mutate(data))(event)
        }}
        className="flex flex-col gap-2 border-t pt-4"
      >
        <Field>
          <FieldLabel htmlFor={`${environment.id}-retention`}>
            Content retention in days
          </FieldLabel>
          <Input
            id={`${environment.id}-retention`}
            type="number"
            {...register("contentRetentionDays", {
              valueAsNumber: true,
              min: 1,
              max: 3650,
              required: true,
            })}
          />
          {errors.contentRetentionDays && (
            <p className="text-sm text-destructive">
              Enter between 1 and 3650 days.
            </p>
          )}
        </Field>
        <Button type="submit" disabled={retention.isPending}>
          Save retention
        </Button>
      </form>
      {(retention.error || disable.error) && (
        <p className="text-sm text-destructive">
          {retention.error?.message ?? disable.error?.message}
        </p>
      )}
      <EnvironmentDeployments
        workspaceSlug={workspaceSlug}
        environmentId={environment.id}
        workflows={workflows}
        enabled={environment.enabled}
      />
      <EnvironmentSecrets
        workspaceSlug={workspaceSlug}
        environmentId={environment.id}
      />
      <EnvironmentConnections environment={environment} onSaved={onSaved} />
      <EnvironmentKeys
        workspaceSlug={workspaceSlug}
        environmentId={environment.id}
        enabled={environment.enabled}
      />
      <Button
        variant="destructive"
        disabled={!environment.enabled || disable.isPending}
        onClick={() => disable.mutate()}
      >
        Disable Environment and revoke user sessions
      </Button>
    </section>
  )
}
