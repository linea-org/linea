import { useFieldArray, useFormContext } from "react-hook-form"
import { z } from "zod"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
import {
  createAgentVersionInputSchema,
  type AgentCatalog,
} from "@/lib/agent-schemas"

export function AgentToolFields({
  operations,
}: Pick<AgentCatalog, "operations">) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<z.infer<typeof createAgentVersionInputSchema>>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "definition.tools",
  })
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Registered tools</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => append({ name: "", operation: "" })}
        >
          <PlusIcon />
          Add tool
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Choose operations the Agent may request. Connections, access grants, and
        reviewer assignments are configured in each Environment.
      </p>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No tools configured.</p>
      )}
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-wrap items-start gap-2 rounded-lg border p-3"
        >
          <Field className="min-w-36 flex-1">
            <FieldLabel htmlFor={`tool-${field.id}-name`}>Tool name</FieldLabel>
            <Input
              id={`tool-${field.id}-name`}
              placeholder="list_issues"
              {...register(`definition.tools.${index}.name`)}
            />
            <FieldError>
              {errors.definition?.tools?.[index]?.name?.message}
            </FieldError>
          </Field>
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor={`tool-${field.id}-operation`}>
              Connector Operation
            </FieldLabel>
            <NativeSelect
              className="w-full"
              id={`tool-${field.id}-operation`}
              {...register(`definition.tools.${index}.operation`)}
            >
              <NativeSelectOption value="">Select operation</NativeSelectOption>
              {operations.map((operation) => (
                <NativeSelectOption key={operation.id} value={operation.id}>
                  {operation.id} ·{" "}
                  {operation.classification === "read" ? "Read" : "Side effect"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>
              {errors.definition?.tools?.[index]?.operation?.message}
            </FieldError>
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mt-6"
            aria-label={`Remove tool ${index + 1}`}
            onClick={() => remove(index)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <FieldError>
        {errors.definition?.tools?.root?.message ??
          errors.definition?.tools?.message}
      </FieldError>
    </section>
  )
}
