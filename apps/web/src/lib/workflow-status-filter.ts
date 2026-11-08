export const WORKFLOW_STATUS_FILTERS = [
  "Draft",
  "Published",
  "Archived",
] as const

export type WorkflowStatusFilter = (typeof WORKFLOW_STATUS_FILTERS)[number]

export function isWorkflowStatusFilter(
  value: unknown
): value is WorkflowStatusFilter {
  return WORKFLOW_STATUS_FILTERS.some((filter) => filter === value)
}
