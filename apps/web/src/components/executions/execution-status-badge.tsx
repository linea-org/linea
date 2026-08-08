import { Badge } from "@linea/ui/components/badge"

import type { ExecutionStatus } from "../../lib/executions-api"

const labelByStatus: Record<ExecutionStatus, string> = {
  queued: "Queued",
  running: "Running",
  paused: "Paused",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
}

const variantByStatus: Record<
  ExecutionStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  queued: "outline",
  running: "default",
  paused: "outline",
  succeeded: "secondary",
  failed: "destructive",
  cancelled: "outline",
}

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <Badge variant={variantByStatus[status]}>{labelByStatus[status]}</Badge>
  )
}
