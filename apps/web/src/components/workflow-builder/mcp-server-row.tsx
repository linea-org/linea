import { Link, useParams } from "@tanstack/react-router"
import { Controller, useFieldArray, useFormContext } from "react-hook-form"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@linealabs/ui/components/button"
import { Card, CardContent } from "@linealabs/ui/components/card"
import { Input } from "@linealabs/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"

import type { McpServersForm } from "./mcp-server-drafts"
import type { McpSecretName } from "./use-mcp-secret-names"

type SecretNames = {
  names: McpSecretName[]
  error: Error | null
  pending: boolean
}

function SecretPicker({
  value,
  secrets,
  onChange,
}: Readonly<{
  value: string
  secrets: SecretNames
  onChange: (secret: string) => void
}>) {
  // Members can't list secrets; they can still name one an admin added.
  if (secrets.error) {
    return (
      <Input
        placeholder="Secret name"
        aria-label="Secret"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  const names = secrets.names.map((secret) => secret.name)
  const items = (
    value && !names.includes(value) ? [value, ...names] : names
  ).map((name) => ({ label: name, value: name }))
  return (
    <Select
      items={items}
      value={value || null}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
      modal={false}
    >
      <SelectTrigger className="w-full" aria-label="Secret">
        <SelectValue placeholder={secrets.pending ? "Loading…" : "Secret"} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function HeaderRows({
  index,
  secrets,
  applicationId,
  onEdit,
}: Readonly<{
  index: number
  secrets: SecretNames
  applicationId: string | undefined
  onEdit: () => void
}>) {
  const { slug } = useParams({ strict: false })
  const { control, register, watch } = useFormContext<McpServersForm>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `servers.${index}.headers`,
  })
  return (
    <>
      {fields.map((field, row) => {
        const secret = watch(`servers.${index}.headers.${row}.secret`)
        const missingIn = secrets.names.find(
          (each) => each.name === secret
        )?.missingIn
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Header"
                aria-label="Header"
                className="w-24 shrink-0"
                {...register(`servers.${index}.headers.${row}.header`, {
                  onChange: onEdit,
                })}
              />
              <div className="min-w-0 flex-1">
                <Controller
                  control={control}
                  name={`servers.${index}.headers.${row}.secret`}
                  render={({ field: picker }) => (
                    <SecretPicker
                      value={picker.value}
                      secrets={secrets}
                      onChange={(next) => {
                        picker.onChange(next)
                        onEdit()
                      }}
                    />
                  )}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove header"
                onClick={() => {
                  remove(row)
                  onEdit()
                }}
              >
                <XIcon />
              </Button>
            </div>
            {missingIn?.length ? (
              <p className="text-xs text-muted-foreground">
                Not set in {missingIn.join(", ")}
              </p>
            ) : null}
          </div>
        )
      })}
      {!secrets.pending && !secrets.error && secrets.names.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No secrets yet.{" "}
          {slug && applicationId ? (
            <Link
              to="/w/$slug/applications/$applicationId"
              params={{ slug, applicationId }}
              className="underline underline-offset-2"
            >
              Add one
            </Link>
          ) : null}
        </p>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => append({ header: "Authorization", secret: "" })}
      >
        <PlusIcon />
        Header
      </Button>
    </>
  )
}

export function McpServerRow({
  id,
  index,
  error,
  secrets,
  applicationId,
  onEdit,
  onRemove,
}: Readonly<{
  id: string | undefined
  index: number
  error: string | undefined
  secrets: SecretNames
  applicationId: string | undefined
  onEdit: () => void
  onRemove: () => void
}>) {
  const { register } = useFormContext<McpServersForm>()
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            id={id}
            placeholder="Name"
            aria-label="Server name"
            {...register(`servers.${index}.name`, { onChange: onEdit })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove server"
            onClick={onRemove}
          >
            <XIcon />
          </Button>
        </div>
        <Input
          placeholder="https://…/mcp"
          aria-label="Server URL"
          {...register(`servers.${index}.url`, { onChange: onEdit })}
        />
        <Input
          placeholder="All tools"
          aria-label="Allowed tools"
          {...register(`servers.${index}.tools`, { onChange: onEdit })}
        />
        <HeaderRows
          index={index}
          secrets={secrets}
          applicationId={applicationId}
          onEdit={onEdit}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
