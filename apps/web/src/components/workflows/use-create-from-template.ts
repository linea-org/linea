import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { applicationsQueryOptions } from "@/lib/applications-api"
import type { TemplateResult } from "@/lib/create-from-template"
import { workflowsQueryOptions } from "@/lib/workflows-api"

export function useCreateFromTemplate(
  slug: string,
  create: (templateId: string) => Promise<TemplateResult>
) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: create,
    onSuccess: async (result) => {
      if (result.kind === "needs-model") return
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
        params: { slug, workflowId: result.workflowId },
        search: { chat: true },
      })
    },
  })
}
