import { useQuery } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"

import { applicationsQueryOptions } from "@/lib/applications-api"
import {
  executionsQueryOptions,
  workspaceExecutionsQueryOptions,
  type ExecutionSummary,
} from "@/lib/executions-api"
import { formatDate } from "@/lib/format"
import { workflowsQueryOptions } from "@/lib/workflows-api"
import { mentionLabel, type MentionCandidate } from "./mention-text"

const RECENT_RUNS = 50

const runCandidate = (run: ExecutionSummary, label: string) => ({
  kind: "run" as const,
  id: run.id,
  label,
  detail: `${run.status} · ${formatDate(run.createdAt)}`,
})

/**
 * Loads only while `enabled`. In a workflow chat only that workflow's own runs are offered,
 * because Inky's get_run refuses any other.
 */
export function useMentionCandidates(
  enabled: boolean,
  workflowId: string | undefined
): { candidates: MentionCandidate[]; isLoading: boolean; error: Error | null } {
  const { slug = "" } = useParams({ strict: false })
  const workspaceRuns = useQuery({
    ...workspaceExecutionsQueryOptions(slug, { limit: RECENT_RUNS }),
    enabled: enabled && !workflowId,
  })
  const workflowRuns = useQuery({
    ...executionsQueryOptions(slug, workflowId ?? ""),
    enabled: enabled && Boolean(workflowId),
  })
  const workflows = useQuery({ ...workflowsQueryOptions(slug), enabled })
  const applications = useQuery({
    ...applicationsQueryOptions(slug),
    enabled,
  })

  const runs = workflowId ? workflowRuns : workspaceRuns
  const runCandidates = workflowId
    ? (workflowRuns.data ?? []).map((run) =>
        runCandidate(run, mentionLabel({ kind: "run", id: run.id }))
      )
    : (workspaceRuns.data?.executions ?? []).map((run) =>
        runCandidate(run, run.workflowName)
      )
  const candidates: MentionCandidate[] = [
    ...runCandidates.slice(0, RECENT_RUNS),
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
