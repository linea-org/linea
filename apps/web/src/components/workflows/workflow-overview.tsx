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
import { workflowStatus } from "./workflow-status-badge"

const RECENT_LIMIT = 5
// Matches the repository default: the API returns at most this many of the newest runs.
const EXECUTIONS_WINDOW = 50

function count(value: number | undefined, capped: boolean) {
  if (value === undefined) return "—"
  return capped ? `${value}+` : value
}

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
  executionsError,
  signals,
}: Readonly<{
  slug: string
  workflow: WorkflowSummary
  executions: ExecutionSummary[] | undefined
  executionsError: boolean
  signals: SignalSummary[] | undefined
}>) {
  const failed = executions?.filter((run) => run.status === "failed").length
  const openSignals = signals?.filter(
    (signal) => signal.status !== "resolved"
  ).length
  const lastRun = executions?.[0]?.createdAt
  const capped = (executions?.length ?? 0) >= EXECUTIONS_WINDOW
  return (
    <section aria-label="Overview" className="flex flex-col gap-4">
      {workflow.description ? (
        <p className="pl-1 text-sm text-muted-foreground">
          {workflow.description}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Status" icon={CircleDotIcon}>
          {workflowStatus(workflow)}
        </StatTile>
        <StatTile label="Executions" icon={PlayIcon}>
          {count(executions?.length, capped)}
        </StatTile>
        <StatTile label="Failed" icon={TriangleAlertIcon}>
          {count(failed, capped)}
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
        {executionsError ? (
          <p className="text-sm text-destructive">Could not load executions.</p>
        ) : (
          <ExecutionList
            executions={(executions ?? []).slice(0, RECENT_LIMIT)}
            slug={slug}
            workflowId={workflow.id}
          />
        )}
      </div>
    </section>
  )
}
