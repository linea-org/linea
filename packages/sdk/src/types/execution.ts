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

/** A newest-first position: `since` for `countNew`, or the `cursor` of an unsorted `list`. */
export function nextExecutionsCursor(
  row: Pick<WorkspaceExecutionWithWorkflow, "createdAt" | "id">
): string {
  return `${row.createdAt}_${row.id}`
}
