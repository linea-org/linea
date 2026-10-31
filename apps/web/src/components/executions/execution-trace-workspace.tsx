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
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
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
}: {
  slug: string
  detail: ExecutionDetailResponse
  pendingReplayStepId: string | null
  onReplayTriggered: (stepId: string) => void
}) {
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
    <section
      aria-label="Execution trace"
      className="mt-4 flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto pl-1 text-sm font-medium">
          Trace{" "}
          <span className="font-normal text-muted-foreground">
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
        <NativeSelect
          size="sm"
          aria-label="Filter trace status"
          value={status}
          onChange={(event) => {
            setStatus(statusFilterSchema.parse(event.target.value))
            clearSelection()
          }}
        >
          <NativeSelectOption value="all">All statuses</NativeSelectOption>
          <NativeSelectOption value="running">Running</NativeSelectOption>
          <NativeSelectOption value="succeeded">Succeeded</NativeSelectOption>
          <NativeSelectOption value="failed">Failed</NativeSelectOption>
          <NativeSelectOption value="skipped">Skipped</NativeSelectOption>
        </NativeSelect>
      </div>
      {pausedAtNode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <p className="text-xs">
            Paused at {stepTitle(pausedAtNode.type)} ·{" "}
            <span className="font-mono">{pausedAtNode.nodeId}</span>
          </p>
          {pausedAtNode.type === "approval" && (
            <Link
              to="/w/$slug/approvals"
              params={{ slug }}
              search={{ executionId: execution.id }}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              View approvals
            </Link>
          )}
        </div>
      )}
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card p-3">
          {orphanedResumeEvents.map((event) => (
            <p key={event.id} className="mb-3 text-xs text-muted-foreground">
              Resumed{" "}
              {hydrated
                ? new Date(event.startedAt).toLocaleString()
                : event.startedAt}
            </p>
          ))}
          {filtered.length ? (
            <ExecutionGanttChart
              steps={filtered}
              executionStartedAt={execution.startedAt}
              executionCompletedAt={execution.completedAt}
              selectedStepId={selected?.id ?? null}
              onStepSelect={selectStep}
            />
          ) : (
            <p className="px-2 py-6 text-xs text-muted-foreground">
              {recorded.length
                ? "No matching steps."
                : "No steps recorded yet."}
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-4">
          {selected ? (
            <>
              {parent && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="mb-3"
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
                  className="mb-3"
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
            </>
          ) : (
            <div className="flex flex-col gap-3 py-6 text-xs text-muted-foreground">
              <p>
                {selectedId && selectedId === pendingReplayStepId
                  ? "Waiting for the replay step to be recorded…"
                  : selectedId
                    ? "This step is not available in this execution."
                    : "Select a recorded step to inspect its input, output, and timing."}
              </p>
              {selectedId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={clearSelection}
                >
                  Clear step selection
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
