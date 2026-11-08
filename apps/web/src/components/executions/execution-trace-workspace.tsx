import { useState } from "react"
import {
  Link,
  useHydrated,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { z } from "zod"
import { Button, buttonVariants } from "@linea/ui/components/button"
import { Input } from "@linea/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import type { ExecutionDetailResponse } from "@/lib/executions-api"
import { ExecutionGanttChart } from "./execution-gantt-chart"
import { ExecutionStepDetails } from "./execution-step-details"
import { attachResumeMarkers } from "./execution-step-order"
import { stepTitle } from "./execution-step-presentation"

const statusFilterSchema = z.enum([
  "all",
  "running",
  "succeeded",
  "failed",
  "skipped",
])

export function ExecutionTraceWorkspace({
  slug,
  detail,
  pendingReplayStepId,
  onReplayTriggered,
}: Readonly<{
  slug: string
  detail: ExecutionDetailResponse
  pendingReplayStepId: string | null
  onReplayTriggered: (stepId: string) => void
}>) {
  const [search, setSearch] = useState("")
  const [status, setStatus] =
    useState<z.infer<typeof statusFilterSchema>>("all")
  const navigate = useNavigate()
  const hydrated = useHydrated()
  const hash = useLocation({ select: (location) => location.hash })
  const selectedId = hydrated && hash.startsWith("step-") ? hash.slice(5) : null
  const { execution, steps, nodeConfigs, pausedAtNode } = detail
  const recorded = steps.filter((step) => !step.isSystemEvent)
  const query = search.trim().toLowerCase()
  const filtered = recorded.filter(
    (step) =>
      (status === "all" || step.status === status) &&
      (!query ||
        `${stepTitle(step.name)} ${step.nodeId} ${step.error?.message ?? ""}`
          .toLowerCase()
          .includes(query))
  )
  const selected = selectedId
    ? recorded.find((step) => step.id === selectedId)
    : (filtered.find((step) => step.status === "failed") ?? filtered[0])
  const { resumedAtByStepId, orphanedResumeEvents } = attachResumeMarkers(steps)
  const parent = selected?.parentSpanId
    ? recorded.find((step) => step.spanId === selected.parentSpanId)
    : undefined
  function selectStep(stepId: string) {
    void navigate({
      to: ".",
      hash: `step-${stepId}`,
      replace: true,
      hashScrollIntoView: false,
    })
  }
  function clearSelection() {
    if (!hash) return
    void navigate({
      to: ".",
      hash: "",
      replace: true,
      hashScrollIntoView: false,
    })
  }
  return (
    <section aria-label="Execution trace" className="flex min-w-0 flex-col">
      <div className="flex h-12 flex-wrap items-center gap-2 border-b bg-muted/40 px-4">
        <h2 className="mr-auto text-xs font-medium">
          Trace
          <span className="ml-1 font-normal text-muted-foreground">
            · {recorded.length} steps
          </span>
        </h2>
        <Input
          className="h-8 w-full sm:w-64"
          aria-label="Search trace steps"
          placeholder="Search steps or errors"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            clearSelection()
          }}
        />
        <Select
          value={status}
          onValueChange={(value) => {
            const parsed = statusFilterSchema.safeParse(value)
            if (!parsed.success) return
            setStatus(parsed.data)
            clearSelection()
          }}
        >
          <SelectTrigger size="xs" aria-label="Filter trace status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {pausedAtNode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-xs">
            Paused at {stepTitle(pausedAtNode.type)} ·{" "}
            <span className="font-mono">{pausedAtNode.nodeId}</span>
          </p>
          {pausedAtNode.type === "approval" && (
            <Link
              to="/w/$slug/approvals"
              params={{ slug }}
              search={{ executionId: execution.id }}
              className={buttonVariants({ size: "xs", variant: "outline" })}
            >
              View approvals
            </Link>
          )}
        </div>
      )}
      {orphanedResumeEvents.map((event) => (
        <p
          key={event.id}
          className="border-b px-4 py-3 text-xs text-muted-foreground"
        >
          Resumed{" "}
          {hydrated
            ? new Date(event.startedAt).toLocaleString()
            : event.startedAt}
        </p>
      ))}
      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-xs text-muted-foreground">
          {recorded.length ? "No matching steps." : "No steps recorded yet."}
        </p>
      ) : (
        <>
          <div className="border-b px-4 py-3">
            <ExecutionGanttChart
              steps={filtered}
              executionStartedAt={execution.startedAt}
              executionCompletedAt={execution.completedAt}
              selectedStepId={selected?.id ?? null}
              onStepSelect={selectStep}
            />
          </div>
          {selected ? (
            <div className="flex flex-col gap-4 px-4 py-3">
              {parent && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    setStatus("all")
                    setSearch("")
                    selectStep(parent.id)
                  }}
                >
                  View parent step: {stepTitle(parent.name)}
                </Button>
              )}
              {selected.replayedFromStepId && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    setStatus("all")
                    setSearch("")
                    selectStep(selected.replayedFromStepId ?? selected.id)
                  }}
                >
                  View original step
                </Button>
              )}
              <ExecutionStepDetails
                key={selected.id}
                executionId={execution.id}
                workflowId={execution.workflowId}
                step={selected}
                nodeConfig={nodeConfigs[selected.nodeId]}
                replayable={detail.replayable}
                resumedAt={resumedAtByStepId.get(selected.id)}
                onReplayTriggered={(stepId) => {
                  setStatus("all")
                  setSearch("")
                  selectStep(stepId)
                  onReplayTriggered(stepId)
                }}
              />
            </div>
          ) : null}
        </>
      )}
      {selectedId && !selected ? (
        <div className="px-4 py-4 text-xs text-muted-foreground">
          <p>
            {selectedId === pendingReplayStepId
              ? "Waiting for the replay step to be recorded…"
              : "This step is not available in this execution."}
          </p>
          <Button
            size="xs"
            variant="outline"
            className="mt-3"
            onClick={clearSelection}
          >
            Clear step selection
          </Button>
        </div>
      ) : null}
    </section>
  )
}
