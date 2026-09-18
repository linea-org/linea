import type {
  RegressionCase as DatabaseRegressionCase,
  RegressionResult as DatabaseRegressionResult,
  RegressionRun as DatabaseRegressionRun,
} from '@linea/db'
import {
  regressionCaseSchema,
  regressionResultSchema,
  regressionRunDetailSchema,
  regressionRunSchema,
  type RegressionCase,
  type RegressionResult,
  type RegressionRun,
  type RegressionRunDetail,
} from '@linea/protocol/resources'

export function regressionCaseProjection(
  regressionCase: DatabaseRegressionCase,
): RegressionCase {
  return regressionCaseSchema.parse({
    id: regressionCase.id,
    workflowId: regressionCase.workflowId,
    caseType: regressionCase.caseType,
    nodeId: regressionCase.nodeId,
    input: regressionCase.input,
    assertions: regressionCase.assertions,
    sourceStepId: regressionCase.sourceStepId,
    sourceSignalId: regressionCase.sourceSignalId,
    sourceFindingId: regressionCase.sourceFindingId,
    createdAt: regressionCase.createdAt.toISOString(),
    archivedAt: regressionCase.archivedAt?.toISOString() ?? null,
  })
}

export function regressionRunProjection(
  run: DatabaseRegressionRun,
): RegressionRun {
  return regressionRunSchema.parse({
    id: run.id,
    workflowId: run.workflowId,
    workflowVersionId: run.workflowVersionId,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    passed: run.passed,
    failed: run.failed,
    total: run.total,
    costMicros: run.costMicros.toString(),
  })
}

export function regressionResultProjection(
  result: DatabaseRegressionResult,
): RegressionResult {
  return regressionResultSchema.parse({
    id: result.id,
    runId: result.runId,
    caseId: result.caseId,
    status: result.status,
    score: result.score,
    output: result.output,
    costMicros: result.costMicros.toString(),
    createdAt: result.createdAt.toISOString(),
  })
}

export function regressionRunDetailProjection(
  run: DatabaseRegressionRun & { results: DatabaseRegressionResult[] },
): RegressionRunDetail {
  return regressionRunDetailSchema.parse({
    ...regressionRunProjection(run),
    results: run.results.map(regressionResultProjection),
  })
}
