import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
import { listAgentsFn } from "@/lib/agents-api"
import { CreateAgentDialog } from "./create-agent-dialog"

export function ApplicationAgents({
  workspaceSlug,
  applicationId,
}: {
  workspaceSlug: string
  applicationId: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const queryKey = ["agents", workspaceSlug, applicationId]
  const {
    data: agents,
    error,
    isPending,
  } = useQuery({
    queryKey,
    queryFn: () => listAgentsFn({ data: { applicationId } }),
  })
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="pl-1 text-xs text-muted-foreground">
          Agents use instructions and tools to decide how to complete a task.
        </p>
        {agents && (
          <CreateAgentDialog
            applicationId={applicationId}
            onCreated={async (agent) => {
              await queryClient.invalidateQueries({ queryKey })
              await navigate({
                to: "/w/$slug/agents/$agentId",
                params: { slug: workspaceSlug, agentId: agent.id },
              })
            }}
          />
        )}
      </div>
      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading Agents…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {agents?.length === 0 && (
        <p className="rounded-xl border bg-card p-12 text-center text-xs text-muted-foreground">
          Create your first Agent, then configure and publish its definition.
        </p>
      )}
      {!!agents?.length && (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              to="/w/$slug/agents/$agentId"
              params={{ slug: workspaceSlug, agentId: agent.id }}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {agent.name}
                  {agent.archivedAt ? " · Archived" : ""}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {agent.description || agent.slug}
                </p>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
