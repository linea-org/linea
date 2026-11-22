import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { apiFetch, parseErrorMessage } from "./api-fetch"

const featureFlagsSchema = z.record(z.string(), z.boolean())

export const getFeatureFlagsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const res = await apiFetch("/flags")
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not load features"))
    }
    return featureFlagsSchema.parse(await res.json())
  }
)

export function featureFlagsQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["feature-flags", workspaceSlug],
    queryFn: () => getFeatureFlagsFn(),
  })
}
