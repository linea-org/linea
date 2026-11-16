import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { applicationsQueryOptions } from "@/lib/applications-api"
import { createWorkflowWithDraft } from "@/lib/create-workflow-with-draft"
import { findOrCreateDefaultApplication } from "@/lib/default-application"
import { workflowsQueryOptions } from "@/lib/workflows-api"
import type { Proposal } from "./proposal"

/** Saves a proposal as a workflow and opens it in the builder. */
export function useCreateFromProposal(slug: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (proposal: Proposal) => {
      const application = await findOrCreateDefaultApplication()
      return createWorkflowWithDraft({
        applicationId: application.id,
        name: proposal.title ?? "Weaver draft",
        graph: proposal.raw,
      })
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
      })
    },
  })
}
