import { Badge } from "@linea/ui/components/badge"
import { useHydrated } from "@tanstack/react-router"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linea/ui/components/tabs"
import type { ExecutionStepSummary, JsonValue } from "@/lib/executions-api"
import { formatCost, stepCostUnpricedState } from "./execution-list"
import {
  ReplayAction,
  AddToRegressionAction,
} from "./execution-step-diagnostics"
import {
  stepTitle,
  stepStatusLabel,
  stepStatusVariant,
  formatStepDuration,
  formatJson,
} from "./execution-step-presentation"
import { ErrorCallout } from "./error-callout"

function StepPayload({
  label,
  value,
}: {
  label: string
  value: Record<string, JsonValue> | null
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-xs font-medium">{label}</h3>
      {value === null ? (
        <p className="text-xs text-muted-foreground">
          No {label.toLowerCase()} recorded.
        </p>
      ) : Object.keys(value).length === 0 ? (
        <p className="text-xs text-muted-foreground">Empty object.</p>
      ) : (
        <dl className="divide-y rounded-lg border">
          {Object.entries(value).map(([key, entry]) => (
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
      )}
    </section>
  )
}

export function ExecutionStepDetails({
  executionId,
  workflowId,
  step,
  nodeConfig,
  replayable,
  resumedAt,
  onReplayTriggered,
}: {
  executionId: string
  workflowId: string
  step: ExecutionStepSummary
  nodeConfig: Record<string, JsonValue> | undefined
  replayable: boolean
  resumedAt: string | undefined
  onReplayTriggered: (stepId: string) => void
}) {
  const hydrated = useHydrated()
  return (
    <section aria-label="Selected step" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {step.replayedFromStepId ? "Replay of " : ""}
          {stepTitle(step.name)}
        </h2>
        <Badge variant={stepStatusVariant[step.status]}>
          {stepStatusLabel[step.status]}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="mt-1">
            {formatStepDuration(step.startedAt, step.endedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Attempt</dt>
          <dd className="mt-1">{step.attempt}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cost</dt>
          <dd className="mt-1">
            {formatCost(step.costMicros, stepCostUnpricedState(step))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tokens</dt>
          <dd className="mt-1">
            {step.tokensInput} in / {step.tokensOutput} out
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Node <span className="font-mono break-all">{step.nodeId}</span> · Step{" "}
        <span className="font-mono break-all">{step.id}</span>
      </p>
      {(step.model || step.provider) && (
        <p className="text-xs text-muted-foreground">
          Model: {[step.provider, step.model].filter(Boolean).join(" · ")}
        </p>
      )}
      {resumedAt && (
        <p className="text-xs text-muted-foreground">
          Resumed {hydrated ? new Date(resumedAt).toLocaleString() : resumedAt}
        </p>
      )}
      {step.error && (
        <ErrorCallout title="This step failed" message={step.error.message} />
      )}
      <Tabs defaultValue="overview" className="min-w-0 gap-4">
        <TabsList variant="line">
          <TabsTrigger value="overview">Details</TabsTrigger>
          <TabsTrigger value="raw">Raw data</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="flex min-w-0 flex-col gap-4">
          <StepPayload label="Input" value={step.input} />
          <StepPayload label="Output" value={step.output} />
        </TabsContent>
        <TabsContent value="raw" className="min-w-0">
          <pre className="max-h-96 overflow-auto rounded-lg bg-surface-canvas p-3 font-mono text-xs break-words whitespace-pre-wrap">
            {JSON.stringify(step, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
      <div className="flex flex-wrap items-start gap-2 border-t pt-1">
        {replayable && !step.replayedFromStepId && (
          <ReplayAction
            executionId={executionId}
            step={step}
            nodeConfig={nodeConfig}
            onReplayTriggered={onReplayTriggered}
          />
        )}
        <AddToRegressionAction workflowId={workflowId} stepId={step.id} />
      </div>
    </section>
  )
}
