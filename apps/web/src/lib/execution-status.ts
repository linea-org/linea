import {
  workspaceExecutionStatusSchema,
  type ExecutionStatus,
} from "@linea/protocol/resources"

export const EXECUTION_STATUSES = workspaceExecutionStatusSchema.options

export const executionStatusDefinition = {
  queued: { label: "Queued", variant: "outline" },
  running: { label: "Running", variant: "info" },
  paused: { label: "Paused", variant: "warning" },
  succeeded: { label: "Succeeded", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
} satisfies Record<
  ExecutionStatus,
  {
    label: string
    variant: "info" | "warning" | "success" | "outline" | "destructive"
  }
>

export function isExecutionStatus(value: unknown): value is ExecutionStatus {
  return workspaceExecutionStatusSchema.safeParse(value).success
}
