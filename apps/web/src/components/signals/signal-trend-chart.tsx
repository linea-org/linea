import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@linea/ui/components/chart"

import type { SignalTrendPoint } from "@/lib/signals-api"
import { fillTrendGaps } from "./fill-trend-gaps"

const chartConfig = {
  count: { label: "Occurrences", color: "var(--primary)" },
} satisfies ChartConfig

export function SignalTrendChart({
  trend,
  days = 30,
}: {
  trend: SignalTrendPoint[]
  days?: number
}) {
  const data = fillTrendGaps(trend, days)
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-56 w-full"
      initialDimension={{ width: 640, height: 224 }}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value: string) =>
            new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          }
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => {
                if (typeof value !== "string") return String(value ?? "")
                return new Date(`${value}T00:00:00`).toLocaleDateString(
                  undefined,
                  { weekday: "short", month: "short", day: "numeric" }
                )
              }}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
