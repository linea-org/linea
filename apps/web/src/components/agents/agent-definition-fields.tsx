import { useFormContext } from "react-hook-form"
import { z } from "zod"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
import { Textarea } from "@linea/ui/components/textarea"
import {
  createAgentVersionInputSchema,
  type AgentCatalog,
  type AgentContract,
} from "@/lib/agent-schemas"

export function AgentDefinitionFields({
  catalog,
  contracts,
}: {
  catalog: AgentCatalog
  contracts: AgentContract[]
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<z.infer<typeof createAgentVersionInputSchema>>()
  return (
    <div className="flex min-w-0 flex-col gap-4">
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
            <p className="text-xs text-muted-foreground">
              Create a public Contract in the Contracts tab before saving a
              version.
            </p>
          )}
        </Field>
      </div>
    </div>
  )
}
