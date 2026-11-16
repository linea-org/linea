import { CheckIcon } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"
import { cn } from "@linea/ui/lib/utils"

import { formatRelativeTime } from "@/components/notifications/format-relative-time"
import type {
  ApplicationOverview,
  ApplicationSummary,
} from "@/lib/applications-api"

const ACTIVITY_DAYS = 7

const environmentLabels = { dev: "Dev", production: "Production" } as const

function environmentState(item: ApplicationOverview["environments"][number]) {
  if (!item.enabled) return { dot: "bg-destructive", hint: "Disabled" }
  if (item.live) return { dot: "bg-success", hint: "Live" }
  return { dot: "bg-muted-foreground/40", hint: "Nothing deployed" }
}

export function EnvironmentPills({
  environments,
}: Readonly<{
  environments: ApplicationOverview["environments"]
}>) {
  return (
    <div className="flex items-center gap-1.5">
      {environments.map((item) => {
        const state = environmentState(item)
        return (
          <Tooltip key={item.environment}>
            <TooltipTrigger
              render={
                <span className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs text-muted-foreground" />
              }
            >
              <span className={cn("size-1.5 rounded-full", state.dot)} />
              {environmentLabels[item.environment]}
            </TooltipTrigger>
            <TooltipContent>{state.hint}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export function setupChecks(
  application: ApplicationSummary,
  overview: ApplicationOverview
) {
  return [
    { label: "Add an agent", done: application.agentCount > 0 },
    { label: "Create a workflow", done: application.workflowCount > 0 },
    { label: "Add a provider key", done: overview.hasProviderKey },
    {
      label: "Deploy to Production",
      done: overview.environments.some(
        (item) => item.environment === "production" && item.live
      ),
    },
  ]
}

export function SetupProgress({
  checks,
}: Readonly<{
  checks: ReturnType<typeof setupChecks>
}>) {
  const done = checks.filter((check) => check.done).length
  const next = checks.find((check) => !check.done)
  return (
    <Tooltip>
      <TooltipTrigger render={<div className="flex flex-col gap-1.5" />}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {next ? `Next: ${next.label}` : "Ready"}
          </span>
          <span className="tabular-nums">
            {done}/{checks.length}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {checks.map((check, index) => (
            <span
              key={check.label}
              className={cn(
                "h-1 rounded-full",
                index < done ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="flex flex-col gap-1 py-1">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-1.5">
              <CheckIcon
                className={cn("size-3", check.done ? "" : "opacity-30")}
              />
              {check.label}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

function lastDays(runsByDay: ApplicationOverview["runsByDay"]) {
  const counts = new Map(runsByDay.map((item) => [item.day, item.count]))
  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const day = new Date()
    day.setUTCDate(day.getUTCDate() - (ACTIVITY_DAYS - 1 - index))
    const key = day.toISOString().slice(0, 10)
    return { date: key, count: counts.get(key) ?? 0 }
  })
}

const runStatusDot: Record<string, string> = {
  succeeded: "bg-success",
  failed: "bg-destructive",
  cancelled: "bg-muted-foreground/40",
}

function RunBars({
  days,
}: Readonly<{ days: { date: string; count: number }[] }>) {
  const peak = Math.max(...days.map((day) => day.count), 1)
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {days.map((day) => (
        <span
          key={day.date}
          className={cn(
            "w-1 rounded-full",
            day.count > 0 ? "bg-primary" : "bg-muted-foreground/25"
          )}
          // Bar height is data, so it can't be a fixed utility class.
          style={{ height: `${Math.max(day.count / peak, 0.15) * 100}%` }}
        />
      ))}
    </span>
  )
}

/** Compact footer figure: a seven-day sparkline and run count; last run in the tooltip. */
export function RecentActivity({
  overview,
}: Readonly<{
  overview: ApplicationOverview
}>) {
  const days = lastDays(overview.runsByDay)
  const total = days.reduce((sum, day) => sum + day.count, 0)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" />
        }
      >
        <RunBars days={days} />
        <span className="tabular-nums">
          {total} {total === 1 ? "run" : "runs"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {overview.lastRun ? (
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                runStatusDot[overview.lastRun.status] ?? "bg-primary"
              )}
            />
            Last run {formatRelativeTime(overview.lastRun.at).toLowerCase()}
          </span>
        ) : (
          "No runs in the last 7 days"
        )}
      </TooltipContent>
    </Tooltip>
  )
}
