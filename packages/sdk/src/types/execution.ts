import type { WorkspaceExecutionWithWorkflow } from "@linea/protocol/resources"

export type {
  CountNewWorkspaceExecutions as CountNewExecutionsParams,
  ListWorkspaceExecutions as ListExecutionsParams,
  WorkspaceExecution as Execution,
  WorkspaceExecutionDetail as ExecutionDetail,
  WorkspaceExecutionPage,
  WorkspaceExecutionStepStatus as ExecutionStepStatus,
  WorkspaceExecutionStep as ExecutionStep,
  WorkspaceExecutionWithWorkflow as ExecutionWithWorkflow,
} from "@linea/protocol/resources"

export function nextExecutionsCursor(
  row: Pick<WorkspaceExecutionWithWorkflow, "createdAt" | "id">
): string {
  return `${row.createdAt}_${row.id}`
}
