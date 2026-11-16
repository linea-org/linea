import { WorkflowIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Spinner } from "@linea/ui/components/spinner"

import { useCreateFromTemplate } from "@/components/workflows/use-create-from-template"
import { createWorkflowFromTemplate } from "@/lib/create-from-template"

export function StartStarterWorkflowButton({
  slug,
}: Readonly<{ slug: string }>) {
  const create = useCreateFromTemplate(slug, createWorkflowFromTemplate)
  return (
    <div className="flex items-center gap-2">
      {create.isError && (
        <p className="text-sm text-destructive">{create.error.message}</p>
      )}
      <Button
        variant="outline"
        disabled={create.isPending}
        onClick={() => create.mutate("chat-assistant")}
      >
        {create.isPending ? <Spinner /> : <WorkflowIcon />}
        Starter workflow
      </Button>
    </div>
  )
}
