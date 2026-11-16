import type { RegressionRun } from "@/lib/regression-runs-api"

const POLL_MS = 2000

/** Polls while a run is in flight or a just-triggered run has not appeared yet, else stops. */
export function regressionPollInterval(
  runs: RegressionRun[] | undefined,
  triggeredAt: string | null
): number | false {
  if (runs?.some((run) => !run.completedAt)) return POLL_MS
  if (!triggeredAt) return false
  return runs?.some((run) => run.startedAt > triggeredAt) ? false : POLL_MS
}
