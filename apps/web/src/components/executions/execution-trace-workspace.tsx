import { useState } from "react"
import {
  Link,
  useHydrated,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { z } from "zod"
import { Button, buttonVariants } from "@linealabs/ui/components/button"
import { Input } from "@linealabs/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"
import type { ExecutionDetailResponse } from "@/lib/executions-api"
import { ExecutionGanttChart } from "./execution-gantt-chart"
import { ExecutionStepDetails } from "./execution-step-details"
import { attachResumeMarkers } from "./execution-step-order"
import { stepTitle } from "./execution-step-presentation"
import { filterTraceSteps, pickSelectedStep } from "./filter-trace-steps"
import { LocalDateTime } from "./local-date-time"

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
  const filtered = filterTraceSteps(recorded, status, query)
  const [failureClosed, setFailureClosed] = useState(false)
  const selected = pickSelectedStep(
    recorded,
    filtered,
    selectedId,
    !failureClosed
  )
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
  const selectedDetail = selected ? (
    <div className="flex flex-col gap-4 px-4 py-3">
      {parent && (
        <Button
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
        contentRestricted={detail.traceContentRestricted}
        resumedAt={resumedAtByStepId.get(selected.id)}
        runErrorMessage={execution.error?.message}
        onReplayTriggered={(stepId) => {
          setStatus("all")
          setSearch("")
          selectStep(stepId)
          onReplayTriggered(stepId)
        }}
      />
    </div>
  ) : null
  return (
    <section
      aria-label="Execution trace"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-medium">
          Trace
          <span className="ml-1 font-normal text-muted-foreground">
            · {recorded.length} steps
          </span>
        </h2>
        {recorded.length > 0 ? (
          <>
            <Input
              className="w-56"
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
              <SelectTrigger aria-label="Filter trace status">
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
          </>
        ) : null}
      </div>
      {pausedAtNode && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            Paused at {stepTitle(pausedAtNode.type)} ·{" "}
            <span className="font-mono">{pausedAtNode.nodeId}</span>
          </p>
          {pausedAtNode.type === "approval" && (
            <Link
              to="/w/$slug/approvals"
              params={{ slug }}
              search={{ executionId: execution.id }}
              className={buttonVariants({ variant: "outline" })}
            >
              View approvals
            </Link>
          )}
        </div>
      )}
      {orphanedResumeEvents.map((event) => (
        <p key={event.id} className="text-sm text-muted-foreground">
          Resumed <LocalDateTime value={event.startedAt} />
        </p>
      ))}
      {/* With nothing recorded the chart shows its own empty state. */}
      {recorded.length > 0 && filtered.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No matching steps</p>
      ) : (
        <ExecutionGanttChart
          steps={filtered}
          allSteps={recorded}
          executionStartedAt={execution.startedAt}
          executionCompletedAt={execution.completedAt}
          selectedStepId={selected?.id ?? null}
          onStepSelect={(stepId) => {
            if (stepId !== selected?.id) {
              selectStep(stepId)
              return
            }
            setFailureClosed(true)
            clearSelection()
          }}
          selectedDetail={selectedDetail}
        />
      )}
      {selectedId && !selected ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">
          <p>
            {selectedId === pendingReplayStepId
              ? "Waiting for the replay step to be recorded…"
              : "This step is not available in this execution."}
          </p>
          <Button variant="outline" className="mt-3" onClick={clearSelection}>
            Clear step selection
          </Button>
        </div>
      ) : null}
    </section>
  )
}
