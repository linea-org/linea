import { Link } from "@tanstack/react-router"
import {
  CalendarClockIcon,
  CircleDotIcon,
  PlayIcon,
  SirenIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"

import { ExecutionList } from "@/components/executions"
import type { ExecutionSummary } from "@/lib/executions-api"
import type { SignalSummary } from "@/lib/signals-api"
import type { WorkflowSummary } from "@/lib/workflows-api"
import { WorkflowStatusBadge } from "./workflow-status-badge"

const RECENT_LIMIT = 5

function StatTile({
  label,
  icon: Icon,
  children,
}: Readonly<{
  label: string
  icon: LucideIcon
  children: React.ReactNode
}>) {
  return (
    <Card size="sm" className="gap-1 py-3">
      <div className="flex flex-col gap-1 px-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </p>
        <div className="flex min-h-7 items-center text-lg font-semibold tabular-nums">
          {children}
        </div>
      </div>
    </Card>
  )
}

export function WorkflowOverview({
  slug,
  workflow,
  executions,
  signals,
}: Readonly<{
  slug: string
  workflow: WorkflowSummary
  executions: ExecutionSummary[] | undefined
  signals: SignalSummary[] | undefined
}>) {
  const failed = executions?.filter((run) => run.status === "failed").length
  const openSignals = signals?.filter(
    (signal) => signal.status !== "resolved"
  ).length
  const lastRun = executions?.[0]?.createdAt
  return (
    <section aria-label="Overview" className="flex flex-col gap-4">
      {workflow.description ? (
        <p className="pl-1 text-sm text-muted-foreground">
          {workflow.description}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Status" icon={CircleDotIcon}>
          <WorkflowStatusBadge workflow={workflow} />
        </StatTile>
        <StatTile label="Executions" icon={PlayIcon}>
          {executions?.length ?? "—"}
        </StatTile>
        <StatTile label="Failed" icon={TriangleAlertIcon}>
          {failed ?? "—"}
        </StatTile>
        <StatTile label="Open signals" icon={SirenIcon}>
          {openSignals ?? "—"}
        </StatTile>
        <StatTile label="Last run" icon={CalendarClockIcon}>
          {lastRun ? new Date(lastRun).toLocaleDateString() : "—"}
        </StatTile>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex h-8 items-center justify-between pl-1">
          <p className="text-base font-medium text-foreground">
            Recent executions
          </p>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={
              <Link
                to="/w/$slug/workflows/$workflowId"
                params={{ slug, workflowId: workflow.id }}
                search={{ view: "executions" }}
              />
            }
          >
            View all
          </Button>
        </div>
        <ExecutionList
          executions={(executions ?? []).slice(0, RECENT_LIMIT)}
          slug={slug}
          workflowId={workflow.id}
        />
      </div>
    </section>
  )
}
