import { useId } from "react"
import { Area, AreaChart } from "recharts"

import {
  ChartContainer,
  type ChartConfig,
} from "@linealabs/ui/components/chart"

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
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--color-count)"
          fill={`url(#${gradientId})`}
          strokeWidth={1.75}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
