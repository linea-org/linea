import { nodeRegistry } from "@linea/runtime/browser"
import { Badge } from "@linea/ui/components/badge"
import { cn } from "@linea/ui/lib/utils"
import { useHydrated } from "@tanstack/react-router"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linea/ui/components/tabs"
import type { ExecutionStepSummary, JsonValue } from "@/lib/executions-api"
import { NODE_CATEGORY_COLORS } from "../workflow-builder/node-category-colors"
import { NodeIcon } from "../workflow-builder/node-icon"
import { formatCost, stepCostUnpricedState } from "./execution-list"
import {
  ReplayAction,
  AddToRegressionAction,
} from "./execution-step-diagnostics"
import {
  stepTitle,
  stepStatusLabel,
  stepStatusVariant,
  formatJson,
  isNodeTypeId,
} from "./execution-step-presentation"
import { ErrorCallout } from "./error-callout"
import { formatDuration } from "@/lib/format"

function isJsonObject(
  value: JsonValue | null
): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function StepPayload({
  label,
  value,
}: Readonly<{
  label: string
  value: JsonValue | null
}>) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-xs font-medium">{label}</h3>
      <PayloadBody label={label} value={value} />
    </section>
  )
}

function PayloadBody({
  label,
  value,
}: Readonly<{ label: string; value: JsonValue | null }>) {
  if (value === null)
    return (
      <p className="text-xs text-muted-foreground">
        No {label.toLowerCase()} recorded.
      </p>
    )
  if (!isJsonObject(value))
    return (
      <pre className="max-h-64 overflow-auto rounded-lg border px-3 py-2 font-mono text-xs whitespace-pre-wrap">
        {formatJson(value)}
      </pre>
    )
  const entries = Object.entries(value)
  if (entries.length === 0)
    return <p className="text-xs text-muted-foreground">Empty object.</p>
  return (
    <dl className="divide-y rounded-lg border">
      {entries.map(([key, entry]) => (
        <div key={key} className="min-w-0 px-3 py-2">
          <dt className="mb-1 font-mono text-xs text-muted-foreground">
            {key}
          </dt>
          <dd className="max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
            {typeof entry === "string" ? (
              entry
            ) : (
              <pre className="font-mono whitespace-pre-wrap">
                {formatJson(entry)}
              </pre>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ExecutionStepDetails({
  executionId,
  workflowId,
  step,
  nodeConfig,
  replayable,
  contentRestricted,
  resumedAt,
  onReplayTriggered,
}: Readonly<{
  executionId: string
  workflowId: string | null
  step: ExecutionStepSummary
  nodeConfig: Record<string, JsonValue> | undefined
  replayable: boolean
  contentRestricted: boolean
  resumedAt: string | undefined
  onReplayTriggered: (stepId: string) => void
}>) {
  const hydrated = useHydrated()
  const title = `${step.replayedFromStepId ? "Replay of " : ""}${stepTitle(step.name)}`
  const colors = isNodeTypeId(step.name)
    ? NODE_CATEGORY_COLORS[nodeRegistry[step.name].ui.category]
    : null
  const model = [step.provider, step.model].filter(Boolean).join(" · ")
  return (
    <section aria-label="Selected step" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
            colors?.bg ?? "bg-muted"
          )}
        >
          {isNodeTypeId(step.name) ? (
            <NodeIcon
              icon={nodeRegistry[step.name].ui.icon}
              className={cn("size-3.5", colors?.icon)}
            />
          ) : null}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-xs font-medium">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {step.nodeId}
            {model ? ` · ${model}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Badge variant={stepStatusVariant[step.status]}>
            {stepStatusLabel[step.status]}
          </Badge>
          <span className="tabular-nums">
            {formatDuration(step.startedAt, step.endedAt)}
          </span>
          <span>Attempt {step.attempt}</span>
          <span>
            {formatCost(step.costMicros, stepCostUnpricedState(step))}
          </span>
          <span className="tabular-nums">
            {step.tokensInput} in / {step.tokensOutput} out
          </span>
        </div>
      </div>
      {resumedAt && (
        <p className="text-xs text-muted-foreground">
          Resumed {hydrated ? new Date(resumedAt).toLocaleString() : resumedAt}
        </p>
      )}
      {step.error && (
        <ErrorCallout title="This step failed" message={step.error.message} />
      )}
      <Tabs defaultValue="overview" className="min-w-0 gap-4">
        <TabsList className="h-8!">
          <TabsTrigger value="overview">Details</TabsTrigger>
          <TabsTrigger value="raw">Raw data</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="flex min-w-0 flex-col gap-4">
          {contentRestricted ? (
            <p className="text-xs text-muted-foreground">
              This run handled an End User&apos;s data, so step input and output
              are visible to workspace admins and owners only.
            </p>
          ) : (
            <>
              <StepPayload label="Input" value={step.input} />
              <StepPayload label="Output" value={step.output} />
            </>
          )}
        </TabsContent>
        <TabsContent value="raw" className="min-w-0">
          <pre className="max-h-96 overflow-auto rounded-lg bg-surface-canvas p-3 font-mono text-xs break-words whitespace-pre-wrap">
            {JSON.stringify(step, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
      <div className="flex flex-wrap items-start gap-2">
        {replayable && !step.replayedFromStepId && step.name !== "agent" && (
          <ReplayAction
            executionId={executionId}
            step={step}
            nodeConfig={nodeConfig}
            onReplayTriggered={onReplayTriggered}
          />
        )}
        {step.name === "agent" && (
          <p className="text-xs text-muted-foreground">
            Run Agent steps can't be replayed or saved as regression cases.
            Start a new Workflow run to try again.
          </p>
        )}
        {workflowId && step.name !== "agent" && !contentRestricted && (
          <AddToRegressionAction workflowId={workflowId} stepId={step.id} />
        )}
      </div>
    </section>
  )
}
