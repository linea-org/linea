import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@linealabs/ui/components/button"
import { Textarea } from "@linealabs/ui/components/textarea"
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
}: Readonly<{
  executionId: string
  step: ExecutionStepSummary
  nodeConfig: Record<string, JsonValue> | undefined
  onReplayTriggered: (replayStepId: string) => void
}>) {
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
        onClick={() => setOpen(true)}
        {...shortcutTarget("run")}
      >
        Replay
        <ShortcutKeys id="run" />
      </Button>
    )
  }
  return (
    <div className="w-full space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Config override — edit and re-run this step against the same input
      </p>
      <Textarea
        value={configText}
        onChange={(event) => {
          setConfigText(event.target.value)
          setParseError(null)
        }}
        rows={6}
        className="font-mono text-sm"
      />
      {parseError ? (
        <p className="text-sm text-destructive">{parseError}</p>
      ) : null}
      {mutation.isError ? (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
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
            // Unchanged keys stay as recorded: the server redacts credentials it sends here.
            mutation.mutate(
              Object.fromEntries(
                Object.entries(parsed).filter(
                  ([key, value]) =>
                    JSON.stringify(value) !== JSON.stringify(nodeConfig?.[key])
                )
              )
            )
          }}
        >
          {mutation.isPending ? "Replaying…" : "Run replay"}
        </Button>
        <Button
          type="button"
          variant="ghost"
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
}: Readonly<{
  workflowId: string
  stepId: string
}>) {
  const mutation = useMutation({
    mutationFn: () =>
      createRegressionCaseFromStepFn({ data: { workflowId, stepId } }),
  })
  if (mutation.isSuccess) {
    return (
      <p className="text-sm text-muted-foreground">Added to regression suite</p>
    )
  }
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        {...shortcutTarget("add-to-suite")}
      >
        {mutation.isPending ? "Adding…" : "Add to regression suite"}
        <ShortcutKeys id="add-to-suite" />
      </Button>
      {mutation.isError ? (
        <p className="mt-1.5 text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  )
}
