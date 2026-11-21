import { db, repositories, type Execution } from '@linealabs/db'
import type { RedactedStep } from './redact-execution-trace'

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

/** Keeps the step timeline but nulls the run's output and its steps' input and output on End-User
 * Executions for callers below admin; the run output is usually a step's output passed through. */
export async function restrictEndUserTrace<
  T extends { execution: Execution; steps: RedactedStep[] },
>(
  detail: T,
  userId: string | undefined,
): Promise<T & { traceContentRestricted: boolean }> {
  if (!(await isTraceContentRestricted(detail.execution, userId)))
    return { ...detail, traceContentRestricted: false }
  return {
    ...detail,
    execution: { ...detail.execution, output: null },
    steps: detail.steps.map((step) => ({ ...step, input: null, output: null })),
    traceContentRestricted: true,
  }
}
