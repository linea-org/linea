import { useMutation, useQuery } from "@tanstack/react-query"

import { runAssistantProposalFn } from "@/lib/assistant-api"
import { findOrCreateDefaultApplication } from "@/lib/default-application"
import { getExecutionFn } from "@/lib/executions-api"
import type { Proposal } from "./proposal"

const POLL_MS = 1000
// A run pauses while an Agent step's child run works, or for an approval that may take much longer.
const PAUSED_POLL_MS = 5000

/** Runs a proposal on the hidden scratch workflow and follows the run until it settles. */
export function useProposalRun() {
  const start = useMutation({
    mutationFn: async (proposal: Proposal) => {
      const application = await findOrCreateDefaultApplication()
      return runAssistantProposalFn({
        data: { applicationId: application.id, graph: proposal.raw },
      })
    },
  })
  const executionId = start.data?.id
  const run = useQuery({
    queryKey: ["assistant-run", executionId],
    queryFn: () => getExecutionFn({ data: { id: executionId ?? "" } }),
    enabled: executionId !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status
      if (status === "queued" || status === "running") return POLL_MS
      return status === "paused" ? PAUSED_POLL_MS : false
    },
  })
  return { start, run, executionId }
}
