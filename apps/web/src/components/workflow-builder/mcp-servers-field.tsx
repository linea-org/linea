import { useEffect, useRef } from "react"
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { PlusIcon } from "lucide-react"
import {
  mcpServersSchema,
  type McpServerConfig,
} from "@linealabs/runtime/browser"
import { Button } from "@linealabs/ui/components/button"

import { checkDrafts, toDrafts, type McpServersForm } from "./mcp-server-drafts"
import { McpServerRow } from "./mcp-server-row"
import { useMcpSecretNames } from "./use-mcp-secret-names"

const MAX_SERVERS = 5

function readServers(value: unknown) {
  const parsed = mcpServersSchema.safeParse(value ?? [])
  return { servers: parsed.success ? toDrafts(parsed.data) : [], parsed }
}

export function McpServersField({
  id,
  applicationId,
  value,
  onChange,
}: Readonly<{
  id: string
  applicationId: string | undefined
  value: unknown
  onChange: (servers: McpServerConfig[] | undefined) => void
}>) {
  const form = useForm<McpServersForm>({
    defaultValues: { servers: readServers(value).servers },
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "servers",
  })
  const drafts = useWatch({ control: form.control, name: "servers" })
  const { errors } = checkDrafts(drafts)
  const secrets = useMcpSecretNames(applicationId)
  const saved = useRef(JSON.stringify(value ?? null))

  // A change saved elsewhere (a collaborator, Inky) replaces the form; our own saves match `saved`.
  useEffect(() => {
    const incoming = JSON.stringify(value ?? null)
    if (incoming === saved.current) return
    saved.current = incoming
    form.reset({ servers: readServers(value).servers })
  }, [value, form])

  // Only a fully valid list is saved, like the JSON fields: a half-typed server never reaches a run.
  function save() {
    const { servers } = checkDrafts(form.getValues("servers"))
    if (!servers) return
    const next = servers.length > 0 ? servers : undefined
    saved.current = JSON.stringify(next ?? null)
    onChange(next)
  }

  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-3">
        {value !== undefined && !readServers(value).parsed.success ? (
          <p className="text-xs text-destructive">
            The saved servers aren&apos;t valid
          </p>
        ) : null}
        {fields.map((field, index) => (
          <McpServerRow
            key={field.id}
            id={index === 0 ? id : undefined}
            index={index}
            error={
              drafts[index]?.name || drafts[index]?.url
                ? errors[index]
                : undefined
            }
            secrets={secrets}
            applicationId={applicationId}
            onEdit={save}
            onRemove={() => {
              remove(index)
              save()
            }}
          />
        ))}
        {fields.length < MAX_SERVERS ? (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              append({ name: "", url: "", tools: "", headers: [] })
            }
          >
            <PlusIcon />
            Add server
          </Button>
        ) : null}
      </div>
    </FormProvider>
  )
}
