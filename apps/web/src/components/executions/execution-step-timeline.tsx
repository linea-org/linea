import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { nodeRegistry, type NodeTypeId } from "@linea/runtime/browser"

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
import { NodeIcon } from "../workflow-builder/node-icon"
import { formatCost, stepCostUnpricedState } from "./execution-list"
import { ErrorCallout } from "./error-callout"

const stepStatusLabel: Record<ExecutionStepSummary["status"], string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  skipped: "Skipped",
}

const stepStatusVariant: Record<
  ExecutionStepSummary["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
  skipped: "outline",
}

function isNodeTypeId(value: string): value is NodeTypeId {
  return value in nodeRegistry
}

function stepTitle(name: string): string {
  if (!isNodeTypeId(name)) return name
  return nodeRegistry[name].ui.label
}

function formatJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

function formatStepDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "Running…"
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground">
        {formatJson(value)}
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
    <Accordion multiple className="px-1">
      {ordered.map((step) =>
        step.isSystemEvent ? (
          <div
            key={step.id}
            className="flex items-center gap-2 border-b px-3 py-4 text-sm text-muted-foreground"
          >
            <Badge variant="outline">Resumed</Badge>
            <span>{new Date(step.startedAt).toLocaleString()}</span>
          </div>
        ) : (
          <AccordionItem
            key={step.id}
            value={step.id}
            className={
              step.replayedFromStepId ? "ml-4 border-l-2 pl-4" : "px-3"
            }
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
                {step.replayedFromStepId ? (
                  <Badge variant="outline">Replay</Badge>
                ) : null}
                <Badge variant={stepStatusVariant[step.status]}>
                  {stepStatusLabel[step.status]}
                </Badge>
                {isNodeTypeId(step.name) ? (
                  <NodeIcon
                    icon={nodeRegistry[step.name].ui.icon}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : null}
                <span className="min-w-0 truncate font-medium text-foreground">
                  {step.replayedFromStepId
                    ? `Replay of ${stepTitle(step.name)}`
                    : stepTitle(step.name)}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatStepDuration(step.startedAt, step.endedAt)}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Node</dt>
                <dd className="truncate font-mono text-foreground">
                  {step.nodeId}
                </dd>
                <dt className="text-muted-foreground">Attempt</dt>
                <dd className="text-foreground">{step.attempt}</dd>
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="text-foreground">
                  {formatCost(step.costMicros, stepCostUnpricedState(step))}
                </dd>
                <dt className="text-muted-foreground">Tokens</dt>
                <dd className="text-foreground">
                  {step.tokensInput} in / {step.tokensOutput} out
                </dd>
              </dl>
              {step.error ? (
                <div className="mt-3">
                  <ErrorCallout
                    title="This step failed"
                    message={step.error.message}
                    stack={step.error.stack}
                  />
                </div>
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
