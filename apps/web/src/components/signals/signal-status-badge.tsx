import { Badge } from "@linealabs/ui/components/badge"

import type { SignalStatus } from "@/lib/signals-api"

const statusVariant: Record<
  SignalStatus,
  "destructive" | "warning" | "success"
> = {
  open: "destructive",
  regressed: "warning",
  resolved: "success",
}

const statusLabel: Record<SignalStatus, string> = {
  open: "Open",
  regressed: "Regressed",
  resolved: "Resolved",
}

export function SignalStatusBadge({ status }: { status: SignalStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
}
