import { db, repositories } from '@linealabs/db'
import { canReadDiagnosticContent } from '../executions/end-user-trace-access'
import { environmentSecrets } from '../executions/redact-execution-trace'
import { redactValue } from '../executions/trace-redaction'

/** Redacts recorded content for a caller allowed to read it; null for one who isn't. */
export type ReadRegressionContent = ((value: unknown) => unknown) | null

/** A case doesn't record its Environment, so the secrets of every one its Application has are redacted. */
export async function regressionContentReader(
  workspaceId: string,
  workflowId: string,
  userId: string | undefined,
): Promise<ReadRegressionContent> {
  if (!(await canReadDiagnosticContent(workspaceId, userId))) return null
  const workflow = await repositories.workflow.getWorkflowById(
    db,
    workspaceId,
    workflowId,
  )
  if (!workflow) return null
  const environments = await repositories.environment.listEnvironments(
    db,
    workspaceId,
    workflow.applicationId,
  )
  const secrets = await Promise.all(
    environments.map(({ id }) => environmentSecrets(id)),
  )
  return (value) => secrets.reduce(redactValue, value)
}
