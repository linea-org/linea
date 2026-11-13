import { db, repositories, type Execution, type ExecutionStep } from '@linea/db'

/** True when the Execution ran on behalf of an End User, so its steps can hold that End User's provider data (ADR 0026). */
export function isEndUserExecution(
  execution: Pick<Execution, 'externalSubjectRecordId' | 'externalSubjectId'>,
): boolean {
  return (
    execution.externalSubjectRecordId !== null ||
    execution.externalSubjectId !== null
  )
}

/** Only a signed-in workspace admin or owner qualifies; workspace API keys never do. */
export async function canReadEndUserTraceContent(
  workspaceId: string,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false
  const role = await repositories.organization.getMemberRole(
    db,
    workspaceId,
    userId,
  )
  return role === 'admin' || role === 'owner'
}

/** Keeps the step timeline but nulls step input and output of End-User Executions for callers below admin. */
export async function restrictEndUserTrace<
  T extends { execution: Execution; steps: ExecutionStep[] },
>(
  detail: T,
  userId: string | undefined,
): Promise<T & { traceContentRestricted: boolean }> {
  const restricted =
    isEndUserExecution(detail.execution) &&
    !(await canReadEndUserTraceContent(detail.execution.workspaceId, userId))
  if (!restricted) return { ...detail, traceContentRestricted: false }
  return {
    ...detail,
    steps: detail.steps.map((step) => ({ ...step, input: null, output: null })),
    traceContentRestricted: true,
  }
}
