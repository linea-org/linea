import {
  ActivityIcon,
  CircleCheckIcon,
  HistoryIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import type { WorkspaceExecutionSummary } from "@/lib/executions-api"
import type { SignalSummary } from "@/lib/signals-api"
import type { WorkflowSummary } from "@/lib/workflows-api"
import { workflowStatus } from "../workflows"
import { countByDay } from "./count-by-day"
import { StatSparkline } from "./stat-sparkline"

const SPARKLINE_DAYS = 7

function StatCard({
  label,
  value,
  icon: Icon,
  data,
}: {
  label: string
  value: string
  icon: LucideIcon
  data: { date: string; count: number }[]
}) {
  return (
    <section className="flex min-h-48 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate font-heading text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="min-h-24 flex-1">
        <StatSparkline data={data} />
      </div>
    </section>
  )
}

export function HomeStats({
  workflows,
  signals,
  executions,
  executionTotal,
}: {
  workflows: WorkflowSummary[]
  signals: SignalSummary[]
  executions: WorkspaceExecutionSummary[]
  executionTotal: number
}) {
  const published = workflows.filter(
    (workflow) => workflowStatus(workflow) === "Published"
  )
  const openSignals = signals.filter((signal) => signal.status !== "resolved")
  const cards: {
    label: string
    value: string
    icon: LucideIcon
    data: { date: string; count: number }[]
  }[] = [
    {
      label: "Workflows",
      value: workflows.length.toLocaleString(),
      icon: WorkflowIcon,
      data: countByDay(
        workflows.map((workflow) => workflow.createdAt),
        SPARKLINE_DAYS
      ),
    },
    {
      label: "Published",
      value: published.length.toLocaleString(),
      icon: CircleCheckIcon,
      data: countByDay(
        published.map((workflow) => workflow.createdAt),
        SPARKLINE_DAYS
      ),
    },
    {
      label: "Open signals",
      value: openSignals.length.toLocaleString(),
      icon: ActivityIcon,
      data: countByDay(
        openSignals.map((signal) => signal.lastFlaggedAt),
        SPARKLINE_DAYS
      ),
    },
    {
      label: "Executions",
      value: executionTotal.toLocaleString(),
      icon: HistoryIcon,
      data: countByDay(
        executions.map((execution) => execution.createdAt),
        SPARKLINE_DAYS
      ),
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  )
}
