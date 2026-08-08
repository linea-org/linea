import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@linea/ui/components/accordion"
import { Badge } from "@linea/ui/components/badge"

import type { ExecutionStepSummary } from "../../lib/executions-api"
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

export function ExecutionStepTimeline({
  steps,
}: {
  steps: ExecutionStepSummary[]
}) {
  if (steps.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">No steps recorded.</p>
    )
  }

  return (
    <Accordion multiple className="mt-4">
      {steps.map((step) =>
        step.isSystemEvent ? (
          <div
            key={step.id}
            className="flex items-center gap-2 border-b py-4 text-sm text-muted-foreground"
          >
            <Badge variant="outline">Resumed</Badge>
            <span>{new Date(step.startedAt).toLocaleString()}</span>
          </div>
        ) : (
          <AccordionItem key={step.id} value={step.id}>
            <AccordionTrigger>
              <div className="flex flex-1 items-center gap-3 pr-4">
                <Badge variant={stepStatusVariant[step.status]}>
                  {step.status}
                </Badge>
                <span className="font-medium text-foreground">{step.name}</span>
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
            </AccordionContent>
          </AccordionItem>
        )
      )}
    </Accordion>
  )
}
