import { nodeRegistry } from "@linea/runtime/browser"
import { Badge } from "@linea/ui/components/badge"
import { Card } from "@linea/ui/components/card"
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
  isNodeTypeId,
} from "./execution-step-presentation"
import { ErrorCallout } from "./error-callout"
import { StepPayloadCard } from "./step-payload-card"
import { formatDuration } from "@/lib/format"

function StatTile({
  label,
  value,
}: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <Card size="sm" className="gap-1 py-3">
      <div className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-base font-medium tabular-nums">{value}</p>
      </div>
    </Card>
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
  runErrorMessage,
  onReplayTriggered,
}: Readonly<{
  executionId: string
  workflowId: string | null
  step: ExecutionStepSummary
  nodeConfig: Record<string, JsonValue> | undefined
  replayable: boolean
  contentRestricted: boolean
  resumedAt: string | undefined
  runErrorMessage: string | undefined
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
          <h2 className="truncate text-sm font-medium">{title}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {step.nodeId}
            {model ? ` · ${model}` : ""}
          </p>
        </div>
        <Badge variant={stepStatusVariant[step.status]}>
          {stepStatusLabel[step.status]}
        </Badge>
        <span className="ml-auto" />
        {replayable && !step.replayedFromStepId && step.name !== "agent" && (
          <ReplayAction
            executionId={executionId}
            step={step}
            nodeConfig={nodeConfig}
            onReplayTriggered={onReplayTriggered}
          />
        )}
        {workflowId && step.name !== "agent" && !contentRestricted && (
          <AddToRegressionAction workflowId={workflowId} stepId={step.id} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Latency"
          value={formatDuration(step.startedAt, step.endedAt)}
        />
        <StatTile
          label="Cost"
          value={formatCost(step.costMicros, stepCostUnpricedState(step))}
        />
        <StatTile
          label="Tokens"
          value={`${step.tokensInput} in / ${step.tokensOutput} out`}
        />
        <StatTile label="Attempt" value={step.attempt} />
      </div>
      {step.name === "agent" ? (
        <p className="text-sm text-muted-foreground">
          Run Agent steps can&apos;t be replayed or saved as regression cases.
          Start a new Workflow run to try again.
        </p>
      ) : null}
      {resumedAt && (
        <p className="text-sm text-muted-foreground">
          Resumed {hydrated ? new Date(resumedAt).toLocaleString() : resumedAt}
        </p>
      )}
      {step.error && step.error.message !== runErrorMessage ? (
        <ErrorCallout title="This step failed" message={step.error.message} />
      ) : null}
      <Tabs defaultValue="overview" className="min-w-0 gap-4">
        <TabsList className="h-8!">
          <TabsTrigger value="overview">Details</TabsTrigger>
          <TabsTrigger value="raw">Raw data</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="flex min-w-0 flex-col gap-4">
          {contentRestricted ? (
            <p className="text-sm text-muted-foreground">
              This run handled an End User&apos;s data, so step input and output
              are visible to workspace admins and owners only.
            </p>
          ) : (
            <>
              <StepPayloadCard label="Input" value={step.input} />
              <StepPayloadCard label="Output" value={step.output} />
            </>
          )}
        </TabsContent>
        <TabsContent value="raw" className="min-w-0">
          <pre className="max-h-96 overflow-auto rounded-lg bg-surface-canvas p-3 font-mono text-sm break-words whitespace-pre-wrap">
            {JSON.stringify(step, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </section>
  )
}
