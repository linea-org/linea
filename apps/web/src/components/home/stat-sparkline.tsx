import { useId } from "react"
import { Area, AreaChart, XAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@linea/ui/components/chart"

const chartConfig = {
  count: { label: "Count", color: "var(--primary)" },
} satisfies ChartConfig

export function StatSparkline({
  data,
}: {
  data: { date: string; count: number }[]
}) {
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
        <XAxis dataKey="date" hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => {
                if (typeof value !== "string") return String(value ?? "")
                return new Date(`${value}T00:00:00`).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" }
                )
              }}
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
          activeDot={{ r: 3 }}
        />
      </AreaChart>
    </ChartContainer>
  )
}
