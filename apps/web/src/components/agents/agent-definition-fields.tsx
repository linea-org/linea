import { Controller, useFormContext } from "react-hook-form"
import { z } from "zod"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
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
    control,
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
          <Controller
            control={control}
            name="definition.model"
            render={({ field }) => (
              <Select
                value={field.value || null}
                onValueChange={(value) => {
                  if (typeof value !== "string") return
                  field.onChange(value)
                }}
              >
                <SelectTrigger id="agent-model" className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError>{errors.definition?.model?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-contract">
            Public Contract revision
          </FieldLabel>
          <Controller
            control={control}
            name="agentContractRevisionId"
            render={({ field }) => (
              <Select
                value={field.value || null}
                disabled={contracts.length === 0}
                items={contracts.map((contract) => ({
                  value: contract.id,
                  label: `Revision ${contract.revision}`,
                }))}
                onValueChange={(value) => {
                  if (typeof value !== "string") return
                  field.onChange(value)
                }}
              >
                <SelectTrigger id="agent-contract" className="w-full">
                  <SelectValue
                    placeholder={
                      contracts.length === 0
                        ? "Create a Contract first"
                        : "Select Contract revision"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      Revision {contract.revision}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError>{errors.agentContractRevisionId?.message}</FieldError>
        </Field>
      </div>
    </div>
  )
}
