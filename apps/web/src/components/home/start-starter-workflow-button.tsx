import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { SparklesIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Spinner } from "@linea/ui/components/spinner"

import {
  applicationsQueryOptions,
  createApplicationFn,
  listApplicationsFn,
} from "@/lib/applications-api"
import {
  STARTER_APPLICATION,
  STARTER_WORKFLOW,
  starterGraph,
  uniqueSlug,
} from "@/lib/starter-workflow"
import {
  createWorkflowFn,
  listApplicationWorkflowsFn,
  saveWorkflowDraftFn,
  workflowsQueryOptions,
} from "@/lib/workflows-api"

export function StartStarterWorkflowButton({ slug }: { slug: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const start = useMutation({
    mutationFn: async () => {
      const applications = await listApplicationsFn()
      const application =
        applications[0] ??
        (await createApplicationFn({ data: STARTER_APPLICATION }))
      const existing = await listApplicationWorkflowsFn({
        data: { applicationId: application.id },
      })
      const workflow = await createWorkflowFn({
        data: {
          ...STARTER_WORKFLOW,
          applicationId: application.id,
          slug: uniqueSlug(
            STARTER_WORKFLOW.slug,
            existing.map((item) => item.slug)
          ),
        },
      })
      await saveWorkflowDraftFn({
        data: { id: workflow.id, graph: starterGraph },
      })
      return workflow
    },
    onSuccess: async (workflow) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: applicationsQueryOptions(slug).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: workflowsQueryOptions(slug).queryKey,
        }),
      ])
      await navigate({
        to: "/w/$slug/workflows/$workflowId/builder",
        params: { slug, workflowId: workflow.id },
        search: { chat: true },
      })
    },
  })
  return (
    <div className="flex items-center gap-2">
      {start.isError && (
        <p className="text-xs text-destructive">{start.error.message}</p>
      )}
      <Button
        size="xs"
        variant="outline"
        disabled={start.isPending}
        onClick={() => start.mutate()}
      >
        {start.isPending ? <Spinner /> : <SparklesIcon />}
        Start from a starter workflow
      </Button>
    </div>
  )
}
