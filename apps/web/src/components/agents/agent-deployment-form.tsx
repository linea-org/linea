import { Controller, useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { deployAgentFn } from "@/lib/agent-deployments-api"
import type {
  AgentBinding,
  AgentContract,
  AgentVersion,
} from "@/lib/agent-schemas"

type DeploymentInput = { versionId: string; enabled: "enabled" | "disabled" }

export function AgentDeploymentForm({
  workspaceSlug,
  environmentId,
  agentId,
  versions,
  contracts,
  binding,
  disabled,
  archived,
}: {
  workspaceSlug: string
  environmentId: string
  agentId: string
  versions: AgentVersion[]
  contracts: AgentContract[]
  binding: AgentBinding | undefined
  disabled: boolean
  archived: boolean
}) {
  const queryClient = useQueryClient()
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DeploymentInput>({
    values: {
      versionId: binding?.agentVersionId ?? "",
      enabled: binding?.enabled === false ? "disabled" : "enabled",
    },
  })
  const published = versions.filter((version) => version.publishedAt)
  const deploy = useMutation({
    mutationFn: (input: DeploymentInput) => {
      const version = published.find(
        (candidate) => candidate.id === input.versionId
      )
      if (!version) throw new Error("Select a published version")
      return deployAgentFn({
        data: {
          environmentId,
          agentId,
          agentVersionId: version.id,
          agentContractRevisionId: version.agentContractRevisionId,
          enabled: input.enabled === "enabled",
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["agent-deployments", workspaceSlug, environmentId],
      })
    },
  })
  return (
    <form
      onSubmit={(event) => {
        void handleSubmit((data) => deploy.mutate(data))(event)
      }}
      className="flex flex-col gap-3"
    >
      <fieldset
        disabled={disabled || deploy.isPending}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field>
          <FieldLabel htmlFor={`${environmentId}-agent-version`}>
            Published version and Contract
          </FieldLabel>
          <Controller
            control={control}
            name="versionId"
            rules={{ required: "Select a published version" }}
            render={({ field }) => (
              <Select
                value={field.value || null}
                items={published.map((version) => ({
                  value: version.id,
                  label: `Version ${version.version} · Contract revision ${contracts.find((contract) => contract.id === version.agentContractRevisionId)?.revision}`,
                }))}
                disabled={
                  published.length === 0 ||
                  archived ||
                  disabled ||
                  deploy.isPending
                }
                onValueChange={(value) => {
                  if (typeof value !== "string") return
                  field.onChange(value)
                }}
              >
                <SelectTrigger
                  id={`${environmentId}-agent-version`}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={
                      published.length === 0
                        ? "Publish a version first"
                        : "Select published version"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {published.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      Version {version.version} · Contract revision{" "}
                      {
                        contracts.find(
                          (contract) =>
                            contract.id === version.agentContractRevisionId
                        )?.revision
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError>{errors.versionId?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${environmentId}-agent-enabled`}>
            Deployment status
          </FieldLabel>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Select
                value={field.value}
                disabled={
                  published.length === 0 || disabled || deploy.isPending
                }
                onValueChange={(value) => {
                  if (value !== "enabled" && value !== "disabled") return
                  field.onChange(value)
                }}
              >
                <SelectTrigger
                  id={`${environmentId}-agent-enabled`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled" disabled={archived}>
                    Enabled
                  </SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Button
          type="submit"
          size="xs"
          disabled={
            published.length === 0 ||
            (archived && watch("enabled") !== "disabled")
          }
          variant="outline"
          className="w-fit justify-self-start sm:col-span-2"
        >
          {deploy.isPending ? "Saving…" : "Save deployment"}
        </Button>
      </fieldset>
      {deploy.error && (
        <p role="alert" className="text-xs text-destructive">
          {deploy.error.message}
        </p>
      )}
      {deploy.isSuccess && (
        <p role="status" className="text-xs text-muted-foreground">
          Deployment saved.
        </p>
      )}
    </form>
  )
}
