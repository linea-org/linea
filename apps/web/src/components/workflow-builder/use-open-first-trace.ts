import { useEffect, type RefObject } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import {
  executionQueryOptions,
  listWorkspaceExecutionsFn,
} from "@/lib/executions-api"

const activeStatuses = new Set(["queued", "running", "paused"])

/** Opens the trace of the workspace's first successful run, unless edits are still unsaved. */
export function useOpenFirstTrace(
  slug: string,
  executionId: string | null,
  unsavedRef: RefObject<boolean>
) {
  const navigate = useNavigate()
  const { data: run } = useQuery({
    ...executionQueryOptions(slug, executionId ?? ""),
    enabled: executionId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status
      return status && activeStatuses.has(status) ? 1500 : false
    },
  })
  const { data: succeeded } = useQuery({
    queryKey: ["first-success", slug, executionId],
    queryFn: () =>
      listWorkspaceExecutionsFn({ data: { status: "succeeded", limit: 1 } }),
    enabled: run?.execution.status === "succeeded",
  })
  const isFirst = succeeded?.total === 1
  useEffect(() => {
    if (!isFirst || !executionId || unsavedRef.current) return
    void navigate({
      to: "/w/$slug/executions/$executionId",
      params: { slug, executionId },
    })
  }, [isFirst, executionId, navigate, slug, unsavedRef])
}
