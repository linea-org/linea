import { useState } from "react"
import { PlusIcon } from "lucide-react"
import {
  mcpServerSchema,
  type McpServerConfig,
} from "@linealabs/runtime/browser"
import { Button } from "@linealabs/ui/components/button"

import { McpServerRow, type ServerDraft } from "./mcp-server-row"
import { useMcpSecretNames } from "./use-mcp-secret-names"

const MAX_SERVERS = 5

function toDrafts(value: unknown): ServerDraft[] {
  const parsed = mcpServerSchema.array().safeParse(value)
  if (!parsed.success) return []
  return parsed.data.map((server) => ({
    id: crypto.randomUUID(),
    name: server.name,
    url: server.url,
    tools: server.tools?.join(", ") ?? "",
    headers: Object.entries(server.headers).map(([header, secret]) => ({
      id: crypto.randomUUID(),
      header,
      secret,
    })),
  }))
}

function toConfig(draft: ServerDraft) {
  const tools = draft.tools
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean)
  return {
    name: draft.name.trim(),
    url: draft.url.trim(),
    headers: Object.fromEntries(
      draft.headers
        .filter((row) => row.header.trim() && row.secret)
        .map((row) => [row.header.trim(), row.secret])
    ),
    ...(tools.length > 0 ? { tools } : {}),
  }
}

function draftError(draft: ServerDraft): string | undefined {
  const result = mcpServerSchema.safeParse(toConfig(draft))
  if (result.success) return undefined
  return result.error.issues[0]?.path[0] === "name"
    ? "Name: up to 20 letters, digits or -"
    : "Enter the server's https URL"
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
  const [drafts, setDrafts] = useState(() => toDrafts(value))
  const secrets = useMcpSecretNames(applicationId)
  // Only a fully valid list is saved, like the JSON fields: a half-typed server never reaches a run.
  function update(next: ServerDraft[]) {
    setDrafts(next)
    if (next.length === 0) return onChange(undefined)
    if (next.some((draft) => draftError(draft))) return
    onChange(next.map((draft) => mcpServerSchema.parse(toConfig(draft))))
  }
  return (
    <div className="flex flex-col gap-3">
      {drafts.map((draft, index) => (
        <McpServerRow
          key={draft.id}
          id={index === 0 ? id : undefined}
          draft={draft}
          error={draft.name || draft.url ? draftError(draft) : undefined}
          secrets={secrets}
          applicationId={applicationId}
          onChange={(changed) =>
            update(
              drafts.map((each) => (each.id === draft.id ? changed : each))
            )
          }
          onRemove={() => update(drafts.filter((each) => each.id !== draft.id))}
        />
      ))}
      {drafts.length < MAX_SERVERS ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() =>
            update([
              ...drafts,
              {
                id: crypto.randomUUID(),
                name: "",
                url: "",
                tools: "",
                headers: [],
              },
            ])
          }
        >
          <PlusIcon />
          Add server
        </Button>
      ) : null}
    </div>
  )
}
