import { useId } from "react"
import { Area, AreaChart } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@linealabs/ui/components/chart"

function formatDay(point: unknown) {
  if (typeof point !== "object" || point === null || !("date" in point)) {
    throw new Error("Sparkline point has no date")
  }
  return new Date(`${String(point.date)}T00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function StatSparkline({
  label,
  data,
}: {
  label: string
  data: { date: string; count: number }[]
}) {
  const chartConfig = {
    count: { label, color: "var(--primary)" },
  } satisfies ChartConfig
  const gradientId = `stat-fill-${useId().replace(/:/g, "")}`
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-full w-full"
      initialDimension={{ width: 240, height: 96 }}
    >
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-count)"
              stopOpacity={0.4}
            />
            <stop
              offset="100%"
              stopColor="var(--color-count)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => formatDay(payload[0]?.payload)}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--color-count)"
          fill={`url(#${gradientId})`}
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartContainer>
  )
}
