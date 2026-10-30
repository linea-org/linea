import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
import { Textarea } from "@linea/ui/components/textarea"
import { createAgentVersionFn } from "@/lib/agents-api"
import {
  createAgentVersionInputSchema,
  type AgentCatalog,
  type AgentContract,
  type AgentVersion,
} from "@/lib/agent-schemas"
import { AgentToolFields } from "./agent-tool-fields"

export function AgentDefinitionForm({
  agentId,
  catalog,
  contracts,
  sourceVersion,
  onSaved,
  onDirtyChange,
}: {
  agentId: string
  catalog: AgentCatalog
  contracts: AgentContract[]
  sourceVersion: AgentVersion | null
  onSaved: (version: AgentVersion) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}) {
  const form = useForm<z.infer<typeof createAgentVersionInputSchema>>({
    resolver: zodResolver(createAgentVersionInputSchema),
    defaultValues: {
      agentId,
      agentContractRevisionId:
        sourceVersion?.agentContractRevisionId ?? contracts[0]?.id ?? "",
      definition: sourceVersion?.definition ?? {
        version: 1,
        instructions: "",
        model: "",
        maxIterations: 10,
        tools: [],
      },
    },
  })
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = form
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])
  const save = useMutation({
    mutationFn: (data: z.infer<typeof createAgentVersionInputSchema>) =>
      createAgentVersionFn({ data }),
    onSuccess: onSaved,
  })
  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => {
          void handleSubmit((data) => save.mutate(data))(event)
        }}
        className="flex flex-col gap-4"
      >
        <fieldset disabled={save.isPending} className="flex flex-col gap-4">
          <div>
            <h2 className="font-semibold">Agent definition</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {sourceVersion
                ? `Based on version ${sourceVersion.version}. Saving creates a new immutable version.`
                : "Configure how this Agent reasons and what it may request."}
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="agent-instructions">Instructions</FieldLabel>
            <Textarea
              id="agent-instructions"
              rows={9}
              placeholder="Describe the task, constraints, and expected outcome…"
              {...register("definition.instructions")}
            />
            <FieldError>{errors.definition?.instructions?.message}</FieldError>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="agent-model">Model</FieldLabel>
              <NativeSelect
                id="agent-model"
                className="w-full"
                {...register("definition.model")}
              >
                <NativeSelectOption value="">Select model</NativeSelectOption>
                {catalog.models.map((model) => (
                  <NativeSelectOption key={model} value={model}>
                    {model}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>{errors.definition?.model?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="agent-iterations">
                Maximum iterations
              </FieldLabel>
              <Input
                id="agent-iterations"
                type="number"
                min={1}
                step={1}
                {...register("definition.maxIterations", {
                  valueAsNumber: true,
                })}
              />
              <FieldError>
                {errors.definition?.maxIterations?.message}
              </FieldError>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="agent-contract">
              Public Contract revision
            </FieldLabel>
            <NativeSelect
              id="agent-contract"
              className="w-full"
              {...register("agentContractRevisionId")}
            >
              <NativeSelectOption value="">
                Select Contract revision
              </NativeSelectOption>
              {contracts.map((contract) => (
                <NativeSelectOption key={contract.id} value={contract.id}>
                  Revision {contract.revision}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>{errors.agentContractRevisionId?.message}</FieldError>
            {contracts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Create a public Contract in the Contracts tab before saving a
                version.
              </p>
            )}
          </Field>
          <AgentToolFields operations={catalog.operations} />
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <Button
            type="submit"
            disabled={save.isPending || contracts.length === 0}
            className="self-start"
          >
            {save.isPending ? "Saving…" : "Save new version"}
          </Button>
        </fieldset>
      </form>
    </FormProvider>
  )
}
