import type { WorkspaceExecutionWithWorkflow } from "@linealabs/protocol/resources"

export type {
  CountNewWorkspaceExecutions as CountNewExecutionsParams,
  ListWorkspaceExecutions as ListExecutionsParams,
  WorkspaceExecution as Execution,
  WorkspaceExecutionDetail as ExecutionDetail,
  WorkspaceExecutionPage,
  WorkspaceExecutionStepStatus as ExecutionStepStatus,
  WorkspaceExecutionStep as ExecutionStep,
  WorkspaceExecutionWithWorkflow as ExecutionWithWorkflow,
} from "@linealabs/protocol/resources"

/** A newest-first position: `since` for `countNew`, or a `cursor` for an unsorted `list`. Sorted lists take the page's `nextCursor`. */
export function nextExecutionsCursor(
  row: Pick<WorkspaceExecutionWithWorkflow, "createdAt" | "id">
): string {
  return `${row.createdAt}_${row.id}`
}
