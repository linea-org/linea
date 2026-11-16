import type { SignalSummary } from "@/lib/signals-api"
import { Card } from "@linea/ui/components/card"

function StatCell({
  label,
  value,
}: Readonly<{ label: string; value: number }>) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function SignalStatCards({ signals }: { signals: SignalSummary[] }) {
  const open = signals.filter((s) => s.status === "open").length
  const regressed = signals.filter((s) => s.status === "regressed").length
  const resolved = signals.filter((s) => s.status === "resolved").length
  return (
    <Card className="grid grid-cols-3 gap-px bg-border py-0">
      <StatCell label="Open" value={open} />
      <StatCell label="Regressed" value={regressed} />
      <StatCell label="Resolved" value={resolved} />
    </Card>
  )
}
