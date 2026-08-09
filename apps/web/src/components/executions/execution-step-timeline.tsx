import { useState } from "react"
import { useMutation } from "@tanstack/react-query"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@linea/ui/components/accordion"
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import { Textarea } from "@linea/ui/components/textarea"

import {
  replayStepFn,
  type ExecutionStepSummary,
  type JsonValue,
} from "../../lib/executions-api"
import { formatCost } from "./execution-list"

const stepStatusVariant: Record<
  ExecutionStepSummary["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
  skipped: "outline",
}

function formatStepDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "Running…"
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

/** Splices each replay immediately after the step it replayed — steps arrive ordered by (startedAt, createdAt), so a replay naturally sorts to wherever it actually ran (usually last), not next to its original. A replay-of-a-replay is rejected server-side, so this is a single-level group-by, not a tree walk. */
function groupWithReplays(
  steps: ExecutionStepSummary[]
): ExecutionStepSummary[] {
  const replaysByOriginal = new Map<string, ExecutionStepSummary[]>()
  const roots: ExecutionStepSummary[] = []
  for (const step of steps) {
    if (step.replayedFromStepId) {
      const siblings = replaysByOriginal.get(step.replayedFromStepId) ?? []
      siblings.push(step)
      replaysByOriginal.set(step.replayedFromStepId, siblings)
    } else {
      roots.push(step)
    }
  }
  return roots.flatMap((root) => [
    root,
    ...(replaysByOriginal.get(root.id) ?? []),
  ])
}

function ReplayAction({
  executionId,
  step,
  nodeConfig,
  onReplayTriggered,
}: {
  executionId: string
  step: ExecutionStepSummary
  nodeConfig: Record<string, JsonValue> | undefined
  onReplayTriggered: (replayStepId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [configText, setConfigText] = useState(() =>
    JSON.stringify(nodeConfig ?? {}, null, 2)
  )
  const [parseError, setParseError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (overrideConfig: Record<string, unknown>) =>
      replayStepFn({
        data: { executionId, stepId: step.id, overrideConfig },
      }),
    onSuccess: (result) => {
      setOpen(false)
      onReplayTriggered(result.replayStepId)
    },
  })

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => setOpen(true)}
      >
        Replay
      </Button>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Config override — edit and re-run this step against the same input
      </p>
      <Textarea
        value={configText}
        onChange={(event) => {
          setConfigText(event.target.value)
          setParseError(null)
        }}
        rows={6}
        className="font-mono text-xs"
      />
      {parseError ? (
        <p className="text-xs text-destructive">{parseError}</p>
      ) : null}
      {mutation.isError ? (
        <p className="text-xs text-destructive">{mutation.error.message}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            let parsed: Record<string, unknown>
            try {
              parsed = JSON.parse(configText) as Record<string, unknown>
            } catch {
              setParseError("Not valid JSON")
              return
            }
            mutation.mutate(parsed)
          }}
        >
          {mutation.isPending ? "Replaying…" : "Run replay"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function ExecutionStepTimeline({
  executionId,
  steps,
  nodeConfigs,
  replayable,
  onReplayTriggered,
}: {
  executionId: string
  steps: ExecutionStepSummary[]
  nodeConfigs: Record<string, Record<string, JsonValue>>
  replayable: boolean
  onReplayTriggered: (replayStepId: string) => void
}) {
  if (steps.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">No steps recorded.</p>
    )
  }

  const ordered = groupWithReplays(steps)

  return (
    <Accordion multiple className="mt-4">
      {ordered.map((step) =>
        step.isSystemEvent ? (
          <div
            key={step.id}
            className="flex items-center gap-2 border-b py-4 text-sm text-muted-foreground"
          >
            <Badge variant="outline">Resumed</Badge>
            <span>{new Date(step.startedAt).toLocaleString()}</span>
          </div>
        ) : (
          <AccordionItem
            key={step.id}
            value={step.id}
            className={
              step.replayedFromStepId ? "ml-4 border-l-2 pl-4" : undefined
            }
          >
            <AccordionTrigger>
              <div className="flex flex-1 items-center gap-3 pr-4">
                {step.replayedFromStepId ? (
                  <Badge variant="outline">Replay</Badge>
                ) : null}
                <Badge variant={stepStatusVariant[step.status]}>
                  {step.status}
                </Badge>
                <span className="font-medium text-foreground">
                  {step.replayedFromStepId
                    ? `Replay of ${step.name}`
                    : step.name}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatStepDuration(step.startedAt, step.endedAt)}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <dl className="grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
                <dt>Node</dt>
                <dd className="text-foreground">{step.nodeId}</dd>
                <dt>Attempt</dt>
                <dd className="text-foreground">{step.attempt}</dd>
                <dt>Cost</dt>
                <dd className="text-foreground">
                  {formatCost(step.costMicros)}
                </dd>
                <dt>Tokens</dt>
                <dd className="text-foreground">
                  {step.tokensInput} in / {step.tokensOutput} out
                </dd>
              </dl>
              {step.error ? (
                <p className="mt-2 text-xs text-destructive">
                  {step.error.message}
                </p>
              ) : null}
              <JsonBlock label="Input" value={step.input} />
              <JsonBlock label="Output" value={step.output} />
              {replayable && !step.replayedFromStepId ? (
                <ReplayAction
                  executionId={executionId}
                  step={step}
                  nodeConfig={nodeConfigs[step.nodeId]}
                  onReplayTriggered={onReplayTriggered}
                />
              ) : null}
            </AccordionContent>
          </AccordionItem>
        )
      )}
    </Accordion>
  )
}
