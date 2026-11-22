import { useQuery } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"

import { applicationsQueryOptions } from "@/lib/applications-api"
import { workspaceExecutionsQueryOptions } from "@/lib/executions-api"
import { formatDate } from "@/lib/format"
import { workflowsQueryOptions } from "@/lib/workflows-api"
import type { MentionCandidate } from "./mention-text"

const RECENT_RUNS = 50

/**
 * Loads only while `enabled`. In a workflow chat only that workflow's runs are offered,
 * because Inky's get_run refuses any other.
 */
export function useMentionCandidates(
  enabled: boolean,
  workflowId: string | undefined
): { candidates: MentionCandidate[]; isLoading: boolean; error: Error | null } {
  const { slug = "" } = useParams({ strict: false })
  const runs = useQuery({
    ...workspaceExecutionsQueryOptions(slug, { limit: RECENT_RUNS }),
    enabled,
  })
  const workflows = useQuery({ ...workflowsQueryOptions(slug), enabled })
  const applications = useQuery({
    ...applicationsQueryOptions(slug),
    enabled,
  })

  const candidates: MentionCandidate[] = [
    ...(runs.data?.executions ?? [])
      .filter((run) => !workflowId || run.workflowId === workflowId)
      .map((run) => ({
        kind: "run" as const,
        id: run.id,
        label: run.workflowName,
        detail: `${run.status} · ${formatDate(run.createdAt)}`,
      })),
    ...(workflows.data ?? [])
      .filter((workflow) => !workflow.archivedAt)
      .map((workflow) => ({
        kind: "workflow" as const,
        id: workflow.id,
        label: workflow.name,
        detail: workflow.slug,
      })),
    ...(applications.data ?? []).map((application) => ({
      kind: "application" as const,
      id: application.id,
      label: application.name,
      detail: application.slug,
    })),
  ]
  return {
    candidates,
    isLoading: runs.isLoading || workflows.isLoading || applications.isLoading,
    error: runs.error ?? workflows.error ?? applications.error,
  }
}
