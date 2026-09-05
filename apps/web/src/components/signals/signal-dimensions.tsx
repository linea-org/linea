import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import type {
  SignalDetail,
  SignalDimension,
  SignalEnvironment,
} from "@/lib/signals-api"

const environments: { label: string; value: SignalEnvironment }[] = [
  { label: "Production", value: "production" },
  { label: "Development", value: "dev" },
  { label: "Draft", value: "draft" },
]

function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(rate)
}

function comparisonLabel(dimension: SignalDimension): string {
  if (dimension.comparison === "only-model-observed") {
    return "Only model observed"
  }
  if (dimension.comparison === "no-baseline-occurrences") {
    return "No occurrences on other models"
  }
  if (dimension.lift === null || dimension.baselineRate === null) {
    return "No comparison available"
  }
  return `${dimension.lift.toFixed(1)}× vs ${formatRate(dimension.baselineRate)} on other models`
}

function emptyMessage(signal: SignalDetail): string {
  if (!signal.dimensionsApplicable) {
    return "Model comparison is available for refusal and empty-response signals linked to AI steps."
  }
  if (signal.totalRuns === 0) {
    return `No eligible ${signal.dimensionScope.environment} AI runs in the last ${signal.dimensionScope.windowDays} days.`
  }
  return "Recent runs do not have model attribution yet."
}

export function SignalDimensions({
  signal,
  environment,
  onEnvironmentChange,
}: {
  signal: SignalDetail
  environment: SignalEnvironment
  onEnvironmentChange: (environment: SignalEnvironment) => void
}) {
  const maxRate = Math.max(...signal.dimensions.map((item) => item.rate), 0)
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 pl-1">
        <div>
          <p className="text-sm font-medium text-foreground">Model breakdown</p>
          <p className="text-xs text-muted-foreground">
            Last {signal.dimensionScope.windowDays} days · successful native
            runs
          </p>
        </div>
        <Select
          items={environments}
          value={environment}
          onValueChange={(value) => {
            if (
              value === "production" ||
              value === "dev" ||
              value === "draft"
            ) {
              onEnvironmentChange(value)
            }
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {environments.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {signal.dimensions.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            {emptyMessage(signal)}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {signal.dimensions.map((dimension) => (
              <li
                key={`${dimension.provider ?? "unknown"}:${dimension.model}`}
                className="px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {dimension.model}
                    </p>
                    <p className="text-muted-foreground">
                      {dimension.provider ?? "Unknown provider"}
                      {dimension.sampleStatus === "limited"
                        ? " · Limited sample"
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-foreground">
                      {formatRate(dimension.rate)}
                    </p>
                    <p className="text-muted-foreground">
                      {dimension.occurrences} of {dimension.totalRuns} runs ·{" "}
                      {comparisonLabel(dimension)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${maxRate > 0 ? (dimension.rate / maxRate) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {signal.totalRuns > 0 && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Model attribution covers {signal.attributedRuns} of{" "}
            {signal.totalRuns} eligible runs.
          </p>
        )}
      </div>
    </div>
  )
}
