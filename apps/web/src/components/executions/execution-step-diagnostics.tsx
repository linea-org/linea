import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import { Textarea } from "@linea/ui/components/textarea"
import { createRegressionCaseFromStepFn } from "@/lib/regression-cases-api"
import {
  replayStepFn,
  type ExecutionStepSummary,
  type JsonValue,
} from "@/lib/executions-api"

export function ReplayAction({
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
        size="xs"
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
          size="xs"
          disabled={mutation.isPending}
          onClick={() => {
            let parsed: Record<string, unknown>
            try {
              const value: unknown = JSON.parse(configText)
              parsed = z.record(z.string(), z.unknown()).parse(value)
            } catch {
              setParseError("Enter a JSON object")
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
          size="xs"
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
export function AddToRegressionAction({
  workflowId,
  stepId,
}: {
  workflowId: string
  stepId: string
}) {
  const mutation = useMutation({
    mutationFn: () =>
      createRegressionCaseFromStepFn({ data: { workflowId, stepId } }),
  })
  if (mutation.isSuccess) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Added to regression suite
      </p>
    )
  }
  return (
    <div className="mt-3">
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Adding…" : "Add to regression suite"}
      </Button>
      {mutation.isError ? (
        <p className="mt-1.5 text-xs text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  )
}
