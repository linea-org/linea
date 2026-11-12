import { useState } from "react"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { PlayIcon } from "lucide-react"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@linea/ui/components/dialog"
import { Field, FieldLabel, FieldError } from "@linea/ui/components/field"
import { Textarea } from "@linea/ui/components/textarea"
import {
  executionsQueryOptions,
  triggerExecutionFn,
} from "@/lib/executions-api"

export function RunWorkflowDialog({
  workspaceSlug,
  workflowId,
  published,
}: {
  readonly workspaceSlug: string
  readonly workflowId: string
  readonly published: boolean
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { payload: "{}" } })
  const run = useMutation({
    mutationFn: (triggerPayload: Record<string, unknown>) =>
      triggerExecutionFn({ data: { workflowId, triggerPayload } }),
    onSuccess: (execution) => {
      void queryClient.invalidateQueries({
        queryKey: executionsQueryOptions(workspaceSlug, workflowId).queryKey,
      })
      setOpen(false)
      void navigate({
        to: "/w/$slug/workflows/$workflowId/executions/$executionId",
        params: { slug: workspaceSlug, workflowId, executionId: execution.id },
      })
    },
  })
  const submit = handleSubmit(({ payload }) => {
    try {
      const input = z.record(z.string(), z.unknown()).parse(JSON.parse(payload))
      run.mutate(input)
    } catch {
      setError("payload", {
        message:
          "Enter a valid JSON object matching the bound Workflow Contract.",
      })
    }
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!published}
            title={published ? undefined : "Publish a version before running"}
            onClick={() => run.reset()}
          >
            <PlayIcon />
            Run
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Workflow</DialogTitle>
          <DialogDescription>
            Run the Development binding with input matching its Workflow
            Contract. Backend starts must be enabled on the binding.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void submit(event)
          }}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="workflow-run-input">Input JSON</FieldLabel>
            <Textarea
              id="workflow-run-input"
              className="min-h-40 font-mono"
              {...register("payload")}
              aria-invalid={Boolean(errors.payload)}
            />
            <FieldError>{errors.payload?.message}</FieldError>
          </Field>
          {run.error && (
            <p role="alert" className="text-sm text-destructive">
              {run.error.message}
            </p>
          )}
          <Button type="submit" disabled={run.isPending}>
            {run.isPending ? "Starting…" : "Run in Development"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
