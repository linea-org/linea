import { db, repositories, type Execution } from '@linealabs/db'
import type { RedactedStep } from './redact-execution-trace'

/** Recorded End-User content (ADR 0026) is for a signed-in workspace admin or owner; workspace API keys never qualify. */
export async function canReadDiagnosticContent(
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
  return !(await canReadDiagnosticContent(execution.workspaceId, userId))
}

function withoutContent(step: RedactedStep): RedactedStep {
  const attributes = step.attributes && { ...step.attributes }
  // The values a step read by reference (ADR 0034) are content, as its input is.
  delete attributes?.references
  return { ...step, attributes, input: null, output: null }
}

/** Keeps the step timeline but removes the run's output and its steps' content on End-User
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
    steps: detail.steps.map(withoutContent),
    traceContentRestricted: true,
  }
}
