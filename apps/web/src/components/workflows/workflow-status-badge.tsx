import { Badge } from "@linea/ui/components/badge"

import type { WorkflowSummary } from "@/lib/workflows-api"

export function workflowStatus(workflow: WorkflowSummary) {
  if (workflow.archivedAt) return "Archived" as const
  if (workflow.publishedVersionId) return "Published" as const
  return "Draft" as const
}

const variantByStatus = {
  Published: "secondary",
  Draft: "outline",
  Archived: "destructive",
} as const

export function WorkflowStatusBadge({
  workflow,
}: {
  workflow: WorkflowSummary
}) {
  const status = workflowStatus(workflow)
  return <Badge variant={variantByStatus[status]}>{status}</Badge>
}
