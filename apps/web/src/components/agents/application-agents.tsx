import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { PlayfulAvatar } from "@/components/avatar"
import { listAgentsFn } from "@/lib/agents-api"

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

export function ApplicationAgents({
  workspaceSlug,
  applicationId,
  query,
  status,
}: {
  workspaceSlug: string
  applicationId: string
  query: string
  status: "all" | "active" | "archived"
}) {
  const queryKey = ["agents", workspaceSlug, applicationId]
  const {
    data: agents,
    error,
    isPending,
  } = useQuery({
    queryKey,
    queryFn: () => listAgentsFn({ data: { applicationId } }),
  })
  const normalizedQuery = query.trim().toLowerCase()
  const visible = (agents ?? []).filter((agent) => {
    if (status === "active" && agent.archivedAt) return false
    if (status === "archived" && !agent.archivedAt) return false
    if (!normalizedQuery) return true
    return `${agent.name} ${agent.slug}`.toLowerCase().includes(normalizedQuery)
  })
  return (
    <section className="flex flex-col">
      {isPending && (
        <p role="status" className="px-4 py-8 text-xs text-muted-foreground">
          Loading Agents…
        </p>
      )}
      {error && (
        <p role="alert" className="px-4 py-8 text-xs text-destructive">
          {error.message}
        </p>
      )}
      {agents?.length === 0 && (
        <p className="px-4 py-8 text-xs text-muted-foreground">
          No Agents in this Application yet.
        </p>
      )}
      {!!agents?.length && visible.length === 0 && (
        <p className="px-4 py-8 text-xs text-muted-foreground">
          No Agents match that search.
        </p>
      )}
      {visible.length > 0 && (
        <div className="divide-y divide-border/70 border-b border-border/70">
          {visible.map((agent) => (
            <Link
              key={agent.id}
              to="/w/$slug/agents/$agentId"
              params={{ slug: workspaceSlug, agentId: agent.id }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <PlayfulAvatar
                name={agent.name}
                shape="rounded"
                className="size-8"
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{agent.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {agent.slug}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {agent.archivedAt ? <span>Archived</span> : null}
                <span className="tabular-nums">
                  {formatDate(agent.updatedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
