import {
  mcpServerSchema,
  mcpServersSchema,
  type McpServerConfig,
} from "@linealabs/runtime/browser"

export type ServerDraft = {
  name: string
  url: string
  tools: string
  headers: { header: string; secret: string }[]
}

export type McpServersForm = { servers: ServerDraft[] }

export function toDrafts(servers: McpServerConfig[]): ServerDraft[] {
  return servers.map((server) => ({
    name: server.name,
    url: server.url,
    tools: server.tools?.join(", ") ?? "",
    headers: Object.entries(server.headers).map(([header, secret]) => ({
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

/** Errors per draft, and the list to save only when every draft is valid. */
export function checkDrafts(drafts: ServerDraft[]) {
  const names = drafts.map((draft) => draft.name.trim())
  const errors = drafts.map(
    (draft, index) =>
      draftError(draft) ??
      (names.indexOf(names[index] ?? "") === index
        ? undefined
        : "Another server has this name")
  )
  const servers = errors.every((error) => !error)
    ? mcpServersSchema.parse(drafts.map(toConfig))
    : undefined
  return { errors, servers }
}
