import { useEffect, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@linea/ui/components/accordion"
import { createAgentVersionFn } from "@/lib/agents-api"
import {
  createAgentVersionInputSchema,
  type AgentCatalog,
  type AgentContract,
  type AgentVersion,
} from "@/lib/agent-schemas"
import { AgentDefinitionFields } from "./agent-definition-fields"
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
  const [sections, setSections] = useState(["definition"])
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
          void handleSubmit(
            (data) => save.mutate(data),
            () => setSections(["definition", "tools"])
          )(event)
        }}
        className="flex flex-col gap-4"
      >
        <fieldset disabled={save.isPending} className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium">Definition</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {sourceVersion
                ? `Based on version ${sourceVersion.version}. Your changes will be saved as a new version.`
                : "Describe the task and choose the model and tools this Agent can use."}
            </p>
          </div>
          <Accordion multiple value={sections} onValueChange={setSections}>
            <AccordionItem value="definition">
              <AccordionTrigger>Instructions and model</AccordionTrigger>
              <AccordionContent keepMounted>
                <AgentDefinitionFields
                  catalog={catalog}
                  contracts={contracts}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tools">
              <AccordionTrigger>Tools and execution limits</AccordionTrigger>
              <AccordionContent keepMounted className="flex flex-col gap-4">
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
                <AgentToolFields operations={catalog.operations} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          {save.error && (
            <p role="alert" className="text-xs text-destructive">
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
