import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { z } from "zod"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError } from "@linea/ui/components/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import {
  createAgentVersionInputSchema,
  type AgentCatalog,
} from "@/lib/agent-schemas"

const toolLabels: Record<string, { group: string; label: string }> = {
  "github.issues.list": { group: "GitHub", label: "List issues" },
  "github.issues.create": { group: "GitHub", label: "Create an issue" },
  "github.repositories.list_public": {
    group: "GitHub",
    label: "List repositories",
  },
  "github.pull_requests.create": {
    group: "GitHub",
    label: "Create a pull request",
  },
  "google.gmail.list_messages": { group: "Gmail", label: "List messages" },
  "google.gmail.send_message": { group: "Gmail", label: "Send a message" },
  "google.calendar.list_events": { group: "Calendar", label: "List events" },
  "google.calendar.create_event": {
    group: "Calendar",
    label: "Create an event",
  },
  "google.calendar.update_event": {
    group: "Calendar",
    label: "Update an event",
  },
}
const groupOrder = ["GitHub", "Gmail", "Calendar"]

function toolName(id: string) {
  const name = id
    .split(/[._]/)
    .filter((part) => part.length > 0)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("")
  return /^[a-zA-Z]\w*$/.test(name) ? name : ""
}

function effectLabel(classification: "read" | "side_effect") {
  switch (classification) {
    case "read":
      return "Read"
    case "side_effect":
      return "Writes"
    default: {
      const unreachable: never = classification
      return unreachable
    }
  }
}

function describeOperation(operation: AgentCatalog["operations"][number]) {
  const known = toolLabels[operation.id]
  const action = operation.id.split(".").at(-1) ?? operation.id
  return {
    id: operation.id,
    group: known?.group ?? operation.provider,
    label: known?.label ?? action.replaceAll("_", " "),
    effect: effectLabel(operation.classification),
  }
}

function orderedChoices(operations: AgentCatalog["operations"]) {
  return operations
    .filter((operation) => operation.provider !== "test")
    .map(describeOperation)
    .sort((left, right) => {
      const leftGroup = groupOrder.indexOf(left.group)
      const rightGroup = groupOrder.indexOf(right.group)
      const group =
        (leftGroup === -1 ? groupOrder.length : leftGroup) -
        (rightGroup === -1 ? groupOrder.length : rightGroup)
      if (group !== 0) return group
      return left.label.localeCompare(right.label)
    })
}

export function AgentToolFields({
  operations,
}: Pick<AgentCatalog, "operations">) {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<z.infer<typeof createAgentVersionInputSchema>>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "definition.tools",
  })
  const tools = useWatch({ control, name: "definition.tools" }) ?? []
  const choices = orderedChoices(operations)
  const groups = [...new Set(choices.map((choice) => choice.group))]
  const taken = new Set(
    tools.map((tool) => tool.operation).filter((id) => id.length > 0)
  )
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium">Tools</h3>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => append({ name: "", operation: "" })}
        >
          <PlusIcon />
          Add tool
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {fields.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No tools yet.
          </p>
        ) : null}
        {fields.map((field, index) => {
          const selected = tools[index]?.operation ?? ""
          const known = choices.some((choice) => choice.id === selected)
          return (
            <div
              key={field.id}
              className="flex items-start gap-2 border-b border-border/70 px-4 py-3 last:border-b-0"
            >
              <Field className="min-w-0 flex-1">
                <Controller
                  control={control}
                  name={`definition.tools.${index}.operation`}
                  render={({ field: operation }) => (
                    <Select
                      value={operation.value || null}
                      onValueChange={(value) => {
                        if (typeof value !== "string") return
                        operation.onChange(value)
                        setValue(
                          `definition.tools.${index}.name`,
                          toolName(value),
                          { shouldDirty: true, shouldValidate: true }
                        )
                      }}
                    >
                      <SelectTrigger
                        id={`tool-${field.id}-operation`}
                        aria-label="Tool"
                        className="w-full"
                      >
                        <SelectValue placeholder="Choose a tool">
                          {(value: string) =>
                            choices.find((choice) => choice.id === value)
                              ?.label ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {selected && !known ? (
                          <SelectGroup>
                            <SelectItem value={selected}>{selected}</SelectItem>
                          </SelectGroup>
                        ) : null}
                        {groups.map((group) => (
                          <SelectGroup key={group}>
                            <SelectLabel>{group}</SelectLabel>
                            {choices
                              .filter((choice) => choice.group === group)
                              .map((choice) => (
                                <SelectItem
                                  key={choice.id}
                                  value={choice.id}
                                  disabled={
                                    taken.has(choice.id) &&
                                    choice.id !== selected
                                  }
                                >
                                  {choice.label}
                                  <span className="text-muted-foreground">
                                    {choice.effect}
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError>
                  {errors.definition?.tools?.[index]?.operation?.message ??
                    errors.definition?.tools?.[index]?.name?.message}
                </FieldError>
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${choices.find((choice) => choice.id === selected)?.label ?? "tool"}`}
                onClick={() => remove(index)}
              >
                <Trash2Icon />
              </Button>
            </div>
          )
        })}
      </div>
      <FieldError>
        {errors.definition?.tools?.root?.message ??
          errors.definition?.tools?.message}
      </FieldError>
    </section>
  )
}
