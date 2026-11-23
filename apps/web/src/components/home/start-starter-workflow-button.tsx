import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"

import { Button } from "@linealabs/ui/components/button"
import { Spinner } from "@linealabs/ui/components/spinner"

import { NeedsModelDialog } from "@/components/models/needs-model-dialog"
import { useCreateFromTemplate } from "@/components/workflows/use-create-from-template"
import { createWorkflowFromTemplate } from "@/lib/create-from-template"

export function StartStarterWorkflowButton({
  slug,
  primary,
}: Readonly<{ slug: string; primary: boolean }>) {
  const create = useCreateFromTemplate(slug, createWorkflowFromTemplate)
  return (
    <div className="flex items-center gap-2">
      <NeedsModelDialog slug={slug} mutation={create} />
      {create.isError && (
        <p className="text-sm text-destructive">{create.error.message}</p>
      )}
      <Button
        variant={primary ? "default" : "outline"}
        disabled={create.isPending}
        onClick={() => create.mutate("chat-assistant")}
        {...shortcutTarget("starter-workflow")}
      >
        {create.isPending ? <Spinner /> : null}
        Starter workflow
        <ShortcutKeys id="starter-workflow" onPrimary={primary} />
      </Button>
    </div>
  )
}
