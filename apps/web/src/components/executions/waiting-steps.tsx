import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@linealabs/ui/components/button"
import type {
  NestedAgentInvocation,
  WaitingNode,
} from "@/lib/execution-detail-schema"
import { stepTitle } from "./execution-step-presentation"

export function WaitingSteps({
  slug,
  executionId,
  nodes,
  nestedAgents,
}: Readonly<{
  slug: string
  executionId: string
  nodes: WaitingNode[]
  nestedAgents: NestedAgentInvocation[]
}>) {
  if (nodes.length === 0) return null
  return (
    <ul aria-label="Waiting on" className="flex flex-col gap-2 text-sm">
      {nodes.map(({ nodeId, type }) => {
        const agentRun = nestedAgents.find((run) => run.nodeId === nodeId)
        return (
          <li
            key={nodeId}
            className="flex min-h-8 flex-wrap items-center justify-between gap-3"
          >
            <p>
              Paused at {stepTitle(type)} ·{" "}
              <span className="font-mono">{nodeId}</span>
            </p>
            {type === "approval" && (
              <Link
                to="/w/$slug/approvals"
                params={{ slug }}
                search={{ executionId }}
                className={buttonVariants({ variant: "outline" })}
              >
                View approvals
              </Link>
            )}
            {agentRun && (
              <Link
                to="/w/$slug/executions/$executionId"
                params={{ slug, executionId: agentRun.executionId }}
                className={buttonVariants({ variant: "outline" })}
              >
                View Agent run
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
