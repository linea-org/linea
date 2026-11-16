import { Card } from "@linea/ui/components/card"
import { BotIcon } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"
import { PlayfulAvatar } from "@/components/avatar"
import { listAgentsFn } from "@/lib/agents-api"
import { formatDate } from "@/lib/format"
import { ListSkeleton } from "@/components/workspace/list-skeleton"

export function ApplicationAgents({
  workspaceSlug,
  applicationId,
  query,
  status,
}: Readonly<{
  workspaceSlug: string
  applicationId: string
  query: string
  status: "all" | "active" | "archived"
}>) {
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
      {isPending && <ListSkeleton className="px-4 py-2" />}
      {error && (
        <p role="alert" className="px-4 py-8 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {agents && visible.length === 0 && (
        <Empty className="mx-4 my-2 w-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BotIcon />
            </EmptyMedia>
            <EmptyTitle>
              {agents.length === 0 ? "No Agents yet" : "No matching Agents"}
            </EmptyTitle>
            <EmptyDescription>
              {agents.length === 0
                ? "Add an Agent to this Application to configure the work it can do."
                : "Try a different search or status filter."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {visible.length > 0 && (
        <div className="px-4 py-2">
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Agent
                  </TableHead>
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="px-4">
                      <Link
                        to="/w/$slug/agents/$agentId"
                        params={{ slug: workspaceSlug, agentId: agent.id }}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <PlayfulAvatar
                          name={agent.name}
                          shape="rounded"
                          className="size-6"
                        />
                        <span className="truncate text-sm font-medium">
                          {agent.name}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground">
                      {agent.archivedAt ? "Archived" : "Active"}
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground tabular-nums">
                      {formatDate(agent.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </section>
  )
}
