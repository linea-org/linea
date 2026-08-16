import type { SignalSummary } from "@/lib/signals-api"

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function SignalStatCards({ signals }: { signals: SignalSummary[] }) {
  const open = signals.filter((s) => s.status === "open").length
  const regressed = signals.filter((s) => s.status === "regressed").length
  const resolved = signals.filter((s) => s.status === "resolved").length
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
      <Card label="Open" value={open} />
      <Card label="Regressed" value={regressed} />
      <Card label="Resolved" value={resolved} />
    </div>
  )
}
