import { Card } from "@linea/ui/components/card"
import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
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
}: Readonly<{
  agentId: string
  catalog: AgentCatalog
  contracts: AgentContract[]
  sourceVersion: AgentVersion | null
  onSaved: (version: AgentVersion) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}>) {
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
        <fieldset disabled={save.isPending} className="flex flex-col gap-6">
          <AgentDefinitionFields catalog={catalog} contracts={contracts} />
          <Card
            render={<section />}
            size="sm"
            className="gap-0 px-(--card-spacing)"
          >
            <AgentToolFields operations={catalog.operations} />
          </Card>
          <Card
            render={<section />}
            size="sm"
            className="flex flex-col gap-0 gap-4 px-(--card-spacing)"
          >
            <h3 className="text-sm font-medium">Execution limits</h3>
            <Field>
              <FieldLabel htmlFor="agent-iterations">
                Maximum iterations
              </FieldLabel>
              <FieldDescription>
                Caps model iterations per run.
              </FieldDescription>
              <Input
                className="max-w-48"
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
          </Card>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {sourceVersion
                ? `Based on version ${sourceVersion.version}. `
                : ""}
              Saving creates a new version. Publish and deploy it when ready.
            </p>
            <Button
              type="submit"
              disabled={save.isPending || contracts.length === 0}
              className="self-start"
            >
              {save.isPending ? "Saving…" : "Save new version"}
            </Button>
          </div>
        </fieldset>
      </form>
    </FormProvider>
  )
}
