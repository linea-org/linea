import { Badge } from "@linea/ui/components/badge"

import type { RegressionResultStatus } from "@/lib/regression-runs-api"

export const regressionResultStatusLabel: Record<
  RegressionResultStatus,
  string
> = {
  passed: "Passed",
  failed: "Failed",
  errored: "Errored",
}

const variantByStatus: Record<
  RegressionResultStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  passed: "secondary",
  failed: "destructive",
  errored: "destructive",
}

export function RegressionResultStatusBadge({
  status,
}: {
  status: RegressionResultStatus
}) {
  return (
    <Badge variant={variantByStatus[status]}>
      {regressionResultStatusLabel[status]}
    </Badge>
  )
}
