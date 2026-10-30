import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { BotIcon, ArrowUpRightIcon } from "lucide-react"
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
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <BotIcon className="size-4" />
            Agents
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable instructions, registered tools, and a stable public
            Contract.
          </p>
        </div>
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
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Create your first Agent, then configure and publish its definition.
        </p>
      )}
      {agents?.map((agent) => (
        <Link
          key={agent.id}
          to="/w/$slug/agents/$agentId"
          params={{ slug: workspaceSlug, agentId: agent.id }}
          className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-accent"
        >
          <div className="min-w-0">
            <p className="font-medium">
              {agent.name}
              {agent.archivedAt ? " · Archived" : ""}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {agent.description || agent.slug}
            </p>
          </div>
          <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </section>
  )
}
