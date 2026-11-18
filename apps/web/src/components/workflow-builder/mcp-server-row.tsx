import { Link, useParams } from "@tanstack/react-router"
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

import type { McpSecretName } from "./use-mcp-secret-names"

type HeaderDraft = { id: string; header: string; secret: string }

export type ServerDraft = {
  id: string
  name: string
  url: string
  tools: string
  headers: HeaderDraft[]
}

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
  draft,
  secrets,
  applicationId,
  onChange,
}: Readonly<{
  draft: ServerDraft
  secrets: SecretNames
  applicationId: string | undefined
  onChange: (headers: HeaderDraft[]) => void
}>) {
  const { slug } = useParams({ strict: false })
  const setRow = (id: string, patch: Partial<HeaderDraft>) =>
    onChange(
      draft.headers.map((row) => (row.id === id ? { ...row, ...patch } : row))
    )
  return (
    <>
      {draft.headers.map((row) => {
        const missingIn = secrets.names.find(
          (secret) => secret.name === row.secret
        )?.missingIn
        return (
          <div key={row.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Header"
                aria-label="Header"
                value={row.header}
                className="w-24 shrink-0"
                onChange={(event) =>
                  setRow(row.id, { header: event.target.value })
                }
              />
              <div className="min-w-0 flex-1">
                <SecretPicker
                  value={row.secret}
                  secrets={secrets}
                  onChange={(secret) => setRow(row.id, { secret })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove header"
                onClick={() =>
                  onChange(draft.headers.filter((each) => each.id !== row.id))
                }
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
        onClick={() =>
          onChange([
            ...draft.headers,
            { id: crypto.randomUUID(), header: "Authorization", secret: "" },
          ])
        }
      >
        <PlusIcon />
        Header
      </Button>
    </>
  )
}

export function McpServerRow({
  id,
  draft,
  error,
  secrets,
  applicationId,
  onChange,
  onRemove,
}: Readonly<{
  id: string | undefined
  draft: ServerDraft
  error: string | undefined
  secrets: SecretNames
  applicationId: string | undefined
  onChange: (draft: ServerDraft) => void
  onRemove: () => void
}>) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            id={id}
            placeholder="Name"
            aria-label="Server name"
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
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
          value={draft.url}
          onChange={(event) => onChange({ ...draft, url: event.target.value })}
        />
        <Input
          placeholder="All tools"
          aria-label="Allowed tools"
          value={draft.tools}
          onChange={(event) =>
            onChange({ ...draft, tools: event.target.value })
          }
        />
        <HeaderRows
          draft={draft}
          secrets={secrets}
          applicationId={applicationId}
          onChange={(headers) => onChange({ ...draft, headers })}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
