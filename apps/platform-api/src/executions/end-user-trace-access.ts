import { db, repositories, type Execution, type ExecutionStep } from '@linea/db'

/** True for an End-User Execution (ADR 0026) unless the caller is a signed-in workspace admin or owner; workspace API keys never qualify. */
export async function isTraceContentRestricted(
  execution: Pick<
    Execution,
    'workspaceId' | 'externalSubjectRecordId' | 'externalSubjectId'
  >,
  userId: string | undefined,
): Promise<boolean> {
  if (
    execution.externalSubjectRecordId === null &&
    execution.externalSubjectId === null
  )
    return false
  if (!userId) return true
  const role = await repositories.organization.getMemberRole(
    db,
    execution.workspaceId,
    userId,
  )
  return role !== 'admin' && role !== 'owner'
}

/** Keeps the step timeline but nulls step input and output of End-User Executions for callers below admin. */
export async function restrictEndUserTrace<
  T extends { execution: Execution; steps: ExecutionStep[] },
>(
  detail: T,
  userId: string | undefined,
): Promise<T & { traceContentRestricted: boolean }> {
  if (!(await isTraceContentRestricted(detail.execution, userId)))
    return { ...detail, traceContentRestricted: false }
  return {
    ...detail,
    steps: detail.steps.map((step) => ({ ...step, input: null, output: null })),
    traceContentRestricted: true,
  }
}
