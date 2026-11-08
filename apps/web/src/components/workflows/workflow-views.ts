import { z } from "zod"

export const workflowViewSchema = z.enum([
  "executions",
  "monitoring",
  "regression",
])
export const workflowViews = {
  executions: "Executions",
  monitoring: "Monitoring",
  regression: "Regression",
} satisfies Record<z.infer<typeof workflowViewSchema>, string>
