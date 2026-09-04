import { Badge } from "@linea/ui/components/badge"

import type { EvalResultStatus } from "@/lib/eval-runs-api"

export const evalResultStatusLabel: Record<EvalResultStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  errored: "Errored",
}

const variantByStatus: Record<
  EvalResultStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  passed: "secondary",
  failed: "destructive",
  errored: "destructive",
}

export function EvalResultStatusBadge({
  status,
}: {
  status: EvalResultStatus
}) {
  return (
    <Badge variant={variantByStatus[status]}>
      {evalResultStatusLabel[status]}
    </Badge>
  )
}
