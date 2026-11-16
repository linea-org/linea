import { useQuery } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"

import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@linea/ui/components/dialog"
import { Spinner } from "@linea/ui/components/spinner"

import { ModelSetupForm } from "@/components/models/model-setup-form"
import type { TemplateResult } from "@/lib/create-from-template"
import { modelSetupQueryOptions } from "@/lib/model-settings-api"

export function NeedsModelDialog({
  slug,
  mutation,
}: Readonly<{
  slug: string
  mutation: UseMutationResult<TemplateResult, Error, string>
}>) {
  const open = mutation.data?.kind === "needs-model"
  const { data: setup, isError, refetch } = useQuery({
    ...modelSetupQueryOptions(slug),
    enabled: open,
  })
  return (
    <Dialog open={open} onOpenChange={() => mutation.reset()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a model to continue</DialogTitle>
        </DialogHeader>
        {setup ? (
          <ModelSetupForm
            slug={slug}
            setup={setup}
            onSaved={() => {
              if (mutation.variables) mutation.mutate(mutation.variables)
            }}
          />
        ) : isError ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-sm text-destructive">
              Could not load your model settings.
            </p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <Spinner />
        )}
      </DialogContent>
    </Dialog>
  )
}
