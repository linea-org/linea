import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
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
}: {
  workspaceSlug: string
  environmentId: string
  agentId: string
  versions: AgentVersion[]
  contracts: AgentContract[]
  binding: AgentBinding | undefined
  disabled: boolean
}) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
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
        className="flex flex-col gap-3"
      >
        <Field>
          <FieldLabel htmlFor={`${environmentId}-agent-version`}>
            Published version and Contract
          </FieldLabel>
          <NativeSelect
            className="w-full"
            id={`${environmentId}-agent-version`}
            {...register("versionId", {
              required: "Select a published version",
            })}
          >
            <NativeSelectOption value="">
              Select published version
            </NativeSelectOption>
            {published.map((version) => (
              <NativeSelectOption key={version.id} value={version.id}>
                Version {version.version} · Contract revision{" "}
                {
                  contracts.find(
                    (contract) =>
                      contract.id === version.agentContractRevisionId
                  )?.revision
                }
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError>{errors.versionId?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${environmentId}-agent-enabled`}>
            Deployment status
          </FieldLabel>
          <NativeSelect
            className="w-full"
            id={`${environmentId}-agent-enabled`}
            {...register("enabled")}
          >
            <NativeSelectOption value="enabled">Enabled</NativeSelectOption>
            <NativeSelectOption value="disabled">Disabled</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Button
          type="submit"
          disabled={published.length === 0}
          variant="outline"
        >
          {deploy.isPending ? "Saving…" : "Save deployment"}
        </Button>
      </fieldset>
      {published.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Publish a version before deploying this Agent.
        </p>
      )}
      {deploy.error && (
        <p role="alert" className="text-sm text-destructive">
          {deploy.error.message}
        </p>
      )}
      {deploy.isSuccess && (
        <p role="status" className="text-sm text-muted-foreground">
          Deployment saved.
        </p>
      )}
    </form>
  )
}
