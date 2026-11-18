import type { ExecutionStep } from '@linealabs/db'

const MAX_STEP_CHARS = 1_500

/** With hideContent, only statuses and errors are shown, never what an End-User sent or got back. */
export function describeSteps(
  steps: ExecutionStep[],
  hideContent: boolean,
): string[] {
  return steps
    .filter((step) => !step.isSystemEvent)
    .map((step) => {
      const detail = step.error
        ? `error: ${step.error.message}`
        : hideContent
          ? 'output hidden (End-User run)'
          : `output: ${JSON.stringify(step.output ?? null)}`
      return `- ${step.nodeId} (${step.status}) ${detail.slice(0, MAX_STEP_CHARS)}`
    })
}
