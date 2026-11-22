import type { FlagKey } from "@linealabs/flags"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"

import { featureFlagsQueryOptions } from "./feature-flags-api"

/** Off until the workspace's flags load, so a flagged feature never flashes in and back out. */
export function useFlag(key: FlagKey): boolean {
  const { slug } = useParams({ strict: false })
  const { data, error } = useQuery({
    ...featureFlagsQueryOptions(slug ?? ""),
    enabled: Boolean(slug),
  })
  if (error) throw error
  if (!data) return false
  const value = data[key]
  if (value === undefined) {
    throw new Error(`The API returned no value for the "${key}" flag`)
  }
  return value
}
