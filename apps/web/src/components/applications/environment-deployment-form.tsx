import {
  Controller,
  useForm,
  type Control,
  type UseFormSetValue,
  type FieldErrors,
} from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Checkbox } from "@linea/ui/components/checkbox"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import {
  deployWorkflowFn,
  listDeploymentVersionsFn,
} from "@/lib/deployments-api"
import type { WorkflowSummary } from "@/lib/workflows-api"

type DeploymentForm = {
  workflowId: string
  versionId: string
  allowBackendStart: boolean
  allowEndUserStart: boolean
  enabled: boolean
}

export function EnvironmentDeploymentForm({
  workspaceSlug,
  environmentId,
  workflows,
  enabled,
}: {
  workspaceSlug: string
  environmentId: string
  workflows: WorkflowSummary[]
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  const queryKey = ["deployments", workspaceSlug, environmentId]
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DeploymentForm>({
    defaultValues: {
      workflowId: "",
      versionId: "",
      allowBackendStart: true,
      allowEndUserStart: false,
      enabled: true,
    },
  })
  const workflowId = watch("workflowId")
  const { data: versions = [], error: versionsError } = useQuery({
    queryKey: ["deployment-versions", workspaceSlug, workflowId],
    queryFn: () => listDeploymentVersionsFn({ data: { workflowId } }),
    enabled: !!workflowId,
  })
  const published = versions.filter(
    (version) => version.publishedAt && version.workflowContractRevisionId
  )
  const deploy = useMutation({
    mutationFn: (input: DeploymentForm) => {
      const version = published.find(
        (candidate) => candidate.id === input.versionId
      )
      if (!version?.workflowContractRevisionId)
        throw new Error("Select a published version with a contract")
      return deployWorkflowFn({
        data: {
          environmentId,
          workflowId: input.workflowId,
          workflowVersionId: version.id,
          workflowContractRevisionId: version.workflowContractRevisionId,
          allowBackendStart: input.allowBackendStart,
          allowEndUserStart: input.allowEndUserStart,
          enabled: input.enabled,
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })
  const error = versionsError ?? deploy.error
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <form
        onSubmit={(event) => {
          void handleSubmit((data) => deploy.mutate(data))(event)
        }}
        className="flex flex-col gap-3"
      >
        <DeploymentVersionFields
          control={control}
          setValue={setValue}
          errors={errors}
          workflows={workflows}
          published={published}
        />
        {deploymentFlags.map((flag) => (
          <label key={flag.name} className="flex items-center gap-2 text-sm">
            <Controller
              name={flag.name}
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            {flag.label}
          </label>
        ))}
        <Button type="submit" disabled={!enabled || deploy.isPending}>
          Save deployment
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </section>
  )
}

const deploymentFlags = [
  { name: "allowBackendStart", label: "Allow backend starts" },
  { name: "allowEndUserStart", label: "Allow verified user starts" },
  { name: "enabled", label: "Enable this deployment" },
] satisfies {
  name: "allowBackendStart" | "allowEndUserStart" | "enabled"
  label: string
}[]

function DeploymentVersionFields({
  control,
  setValue,
  errors,
  workflows,
  published,
}: {
  control: Control<DeploymentForm>
  setValue: UseFormSetValue<DeploymentForm>
  errors: FieldErrors<DeploymentForm>
  workflows: WorkflowSummary[]
  published: { id: string; version: number }[]
}) {
  return (
    <>
      {" "}
      <Field>
        <FieldLabel>Workflow</FieldLabel>
        <Controller
          name="workflowId"
          control={control}
          rules={{ required: "Select a Workflow" }}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                setValue("versionId", "")
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows
                  .filter((workflow) => !workflow.archivedAt)
                  .map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError>{errors.workflowId?.message}</FieldError>
      </Field>
      <Field>
        <FieldLabel>Published version</FieldLabel>
        <Controller
          name="versionId"
          control={control}
          rules={{ required: "Select a published version" }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {published.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    Version {version.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError>{errors.versionId?.message}</FieldError>
      </Field>
    </>
  )
}
