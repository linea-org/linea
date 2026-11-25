import { Badge } from "@linealabs/ui/components/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linealabs/ui/components/tabs"
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
} from "./execution-step-presentation"
import { ErrorCallout } from "./error-callout"
import { StepPayloadCard } from "./step-payload-card"
import { formatDuration } from "@/lib/format"
import { LocalDateTime } from "./local-date-time"

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
  const title = `${step.replayedFromStepId ? "Replay of " : ""}${stepTitle(step.name)}`
  const model = [step.provider, step.model].filter(Boolean).join(" · ")
  return (
    <section aria-label="Selected step" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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
      <p className="text-sm text-muted-foreground tabular-nums">
        {[
          formatDuration(step.startedAt, step.endedAt),
          formatCost(step.costMicros, stepCostUnpricedState(step)),
          `${step.tokensInput} in / ${step.tokensOutput} out tokens`,
          `attempt ${step.attempt}`,
        ].join(" · ")}
      </p>
      {step.name === "agent" ? (
        <p className="text-sm text-muted-foreground">
          Run Agent steps can&apos;t be replayed or saved as regression cases.
          Start a new Workflow run to try again.
        </p>
      ) : null}
      {resumedAt && (
        <p className="text-sm text-muted-foreground">
          Resumed <LocalDateTime value={resumedAt} />
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
              {step.attributes?.references ? (
                <StepPayloadCard
                  label="References"
                  value={step.attributes.references}
                />
              ) : null}
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
