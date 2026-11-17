import { Badge } from "@linealabs/ui/components/badge"

import { executionStatusDefinition } from "@/lib/execution-status"
import type { ExecutionStatus } from "@/lib/executions-api"

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <Badge variant={executionStatusDefinition[status].variant}>
      {executionStatusDefinition[status].label}
    </Badge>
  )
}
