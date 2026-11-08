import type { ExecutionStepSummary } from "@/lib/executions-api"

export function attachResumeMarkers(steps: ExecutionStepSummary[]): {
  resumedAtByStepId: Map<string, string>
  orphanedResumeEvents: ExecutionStepSummary[]
} {
  const resumedAtByStepId = new Map<string, string>()
  const orphanedResumeEvents: ExecutionStepSummary[] = []
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]
    if (!step.isSystemEvent) continue
    const next = steps[i + 1]
    if (next && !next.isSystemEvent) {
      resumedAtByStepId.set(next.id, step.startedAt)
    } else {
      orphanedResumeEvents.push(step)
    }
  }
  return { resumedAtByStepId, orphanedResumeEvents }
}
