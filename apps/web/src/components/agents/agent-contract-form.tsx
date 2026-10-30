import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { jsonSchemaDocumentSchema } from "@linea/protocol/resources"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Textarea } from "@linea/ui/components/textarea"
import { createAgentContractFn } from "@/lib/agent-contracts-api"

const schemaText = z.string().transform((text, context) => {
  try {
    const value: unknown = JSON.parse(text)
    const result = jsonSchemaDocumentSchema.safeParse(value)
    if (result.success) return result.data
  } catch {
    context.addIssue({ code: "custom", message: "Enter valid JSON" })
    return z.NEVER
  }
  context.addIssue({ code: "custom", message: "Enter a JSON Schema object" })
  return z.NEVER
})

const schema = z.object({ inputSchema: schemaText, outputSchema: schemaText })

export function AgentContractForm({
  agentId,
  onSaved,
}: {
  agentId: string
  onSaved: () => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      inputSchema:
        '{\n  "type": "object",\n  "properties": { "task": { "type": "string" } },\n  "required": ["task"],\n  "additionalProperties": false\n}',
      outputSchema:
        '{\n  "type": "object",\n  "properties": { "summary": { "type": "string" } },\n  "required": ["summary"],\n  "additionalProperties": false\n}',
    },
  })
  const save = useMutation({
    mutationFn: (data: z.output<typeof schema>) =>
      createAgentContractFn({ data: { agentId, ...data } }),
    onSuccess: onSaved,
  })
  return (
    <form
      onSubmit={(event) => {
        void handleSubmit((data) => save.mutate(data))(event)
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="font-semibold">New Contract revision</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the public input and output with JSON Schema. Revisions are
          immutable and independent of definition versions.
        </p>
      </div>
      {(
        ["inputSchema", "outputSchema"] satisfies (keyof z.input<
          typeof schema
        >)[]
      ).map((name) => (
        <Field key={name}>
          <FieldLabel htmlFor={`agent-${name}`}>
            {name === "inputSchema" ? "Input" : "Output"} JSON Schema
          </FieldLabel>
          <Textarea
            id={`agent-${name}`}
            rows={9}
            spellCheck={false}
            className="font-mono text-xs"
            {...register(name)}
          />
          <FieldError>{errors[name]?.message}</FieldError>
        </Field>
      ))}
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-sm text-muted-foreground">
          Contract revision saved. Select it in the definition editor.
        </p>
      )}
      <Button type="submit" disabled={save.isPending} className="self-start">
        {save.isPending ? "Saving…" : "Create Contract revision"}
      </Button>
    </form>
  )
}
