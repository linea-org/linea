import type {
  RegressionCase as DatabaseRegressionCase,
  RegressionResult as DatabaseRegressionResult,
  RegressionRun as DatabaseRegressionRun,
} from '@linealabs/db'
import {
  regressionCaseSchema,
  regressionResultSchema,
  regressionRunDetailSchema,
  regressionRunSchema,
  type RegressionCase,
  type RegressionResult,
  type RegressionRun,
  type RegressionRunDetail,
} from '@linealabs/protocol/resources'
import type { ReadRegressionContent } from './regression-content'

export function regressionCaseProjection(
  regressionCase: DatabaseRegressionCase,
  readContent: ReadRegressionContent,
): RegressionCase {
  return regressionCaseSchema.parse({
    id: regressionCase.id,
    workflowId: regressionCase.workflowId,
    caseType: regressionCase.caseType,
    nodeId: regressionCase.nodeId,
    input: readContent?.(regressionCase.input) ?? null,
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
  readContent: ReadRegressionContent,
): RegressionResult {
  return regressionResultSchema.parse({
    id: result.id,
    runId: result.runId,
    caseId: result.caseId,
    status: result.status,
    score: result.score,
    output: readContent?.(result.output) ?? null,
    costMicros: result.costMicros.toString(),
    createdAt: result.createdAt.toISOString(),
  })
}

export function regressionRunDetailProjection(
  run: DatabaseRegressionRun & { results: DatabaseRegressionResult[] },
  readContent: ReadRegressionContent,
): RegressionRunDetail {
  return regressionRunDetailSchema.parse({
    ...regressionRunProjection(run),
    results: run.results.map((result) =>
      regressionResultProjection(result, readContent),
    ),
  })
}
