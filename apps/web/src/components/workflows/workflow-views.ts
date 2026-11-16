import { z } from "zod"

export const workflowViewSchema = z.enum([
  "overview",
  "executions",
  "monitoring",
  "regression",
])
export const DEFAULT_WORKFLOW_VIEW = "overview"
export const workflowViews = {
  overview: "Overview",
  executions: "Executions",
  monitoring: "Monitoring",
  regression: "Regression",
} satisfies Record<z.infer<typeof workflowViewSchema>, string>
