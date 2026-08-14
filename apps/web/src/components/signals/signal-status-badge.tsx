import { Badge } from "@linea/ui/components/badge"

import type { SignalStatus } from "../../lib/signals-api"

const statusVariant: Record<
  SignalStatus,
  "destructive" | "secondary" | "outline"
> = {
  open: "destructive",
  regressed: "destructive",
  resolved: "secondary",
}

const statusLabel: Record<SignalStatus, string> = {
  open: "Open",
  regressed: "Regressed",
  resolved: "Resolved",
}

export function SignalStatusBadge({ status }: { status: SignalStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
}
