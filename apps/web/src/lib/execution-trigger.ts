import type { ExecutionTrigger } from "@/lib/executions-api"

export const EXECUTION_TRIGGERS: ExecutionTrigger[] = [
  "manual",
  "schedule",
  "webhook",
  "api",
]

export const triggerLabel: Record<ExecutionTrigger, string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  api: "API",
}

export function isExecutionTrigger(value: unknown): value is ExecutionTrigger {
  return EXECUTION_TRIGGERS.some((trigger) => trigger === value)
}
