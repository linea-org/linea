import { Link, useParams } from "@tanstack/react-router"
import { ExecutionStatusBadge } from "./execution-status-badge"
import type { NestedAgentInvocation } from "@/lib/execution-detail-schema"

export function NestedAgentRuns({
  nested,
}: Readonly<{ nested: NestedAgentInvocation[] }>) {
  const { slug } = useParams({ strict: false })
  if (nested.length === 0 || !slug) return null
  return (
    <section
      aria-label="Agent runs in this Workflow run"
      className="border-b px-4 py-3"
    >
      <h2 className="text-xs font-medium">Agent runs in this Workflow run</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {nested.map((item) => (
          <li
            key={item.executionId}
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            <span className="font-mono text-muted-foreground">
              {item.nodeId}
            </span>
            <ExecutionStatusBadge status={item.status} />
            <Link
              to="/w/$slug/agents/$agentId"
              params={{ slug, agentId: item.agentId }}
              className="underline underline-offset-4"
            >
              Agent
            </Link>
            <Link
              to="/w/$slug/executions/$executionId"
              params={{ slug, executionId: item.executionId }}
              className="underline underline-offset-4"
            >
              Open this Agent run
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
