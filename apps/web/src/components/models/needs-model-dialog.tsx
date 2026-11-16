import { useQuery } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"

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

/** Asks for a model and its key in place, then repeats the template the user clicked. */
export function NeedsModelDialog({
  slug,
  mutation,
}: Readonly<{
  slug: string
  mutation: UseMutationResult<TemplateResult, Error, string>
}>) {
  const open = mutation.data?.kind === "needs-model"
  const { data: setup } = useQuery({
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
        ) : (
          <Spinner />
        )}
      </DialogContent>
    </Dialog>
  )
}
