import { SparklesIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Spinner } from "@linea/ui/components/spinner"

import { useCreateFromTemplate } from "@/components/workflows/use-create-from-template"

export function StartStarterWorkflowButton({ slug }: { slug: string }) {
  const create = useCreateFromTemplate(slug)
  return (
    <div className="flex items-center gap-2">
      {create.isError && (
        <p className="text-xs text-destructive">{create.error.message}</p>
      )}
      <Button
        size="xs"
        variant="outline"
        disabled={create.isPending}
        onClick={() => create.mutate("chat-assistant")}
      >
        {create.isPending ? <Spinner /> : <SparklesIcon />}
        Start from a starter workflow
      </Button>
    </div>
  )
}
