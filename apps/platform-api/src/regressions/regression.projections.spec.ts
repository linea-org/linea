import {
  regressionCaseProjection,
  regressionRunDetailProjection,
} from './regression.projections'

describe('regression projections', () => {
  it('projects a regression case without workspace state', () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z')
    expect(
      regressionCaseProjection({
        id: 'case-id',
        workspaceId: 'workspace-id',
        workflowId: 'workflow-id',
        caseType: 'node',
        nodeId: 'node-id',
        input: { prompt: 'hello' },
        assertions: [],
        sourceStepId: null,
        sourceSignalId: null,
        sourceFindingId: null,
        createdAt,
        archivedAt: null,
      }),
    ).toEqual({
      id: 'case-id',
      workflowId: 'workflow-id',
      caseType: 'node',
      nodeId: 'node-id',
      input: { prompt: 'hello' },
      assertions: [],
      sourceStepId: null,
      sourceSignalId: null,
      sourceFindingId: null,
      createdAt: createdAt.toISOString(),
      archivedAt: null,
    })
  })

  it('serializes regression run dates and bigint costs', () => {
    const startedAt = new Date('2026-01-02T03:04:05.000Z')
    const completedAt = new Date('2026-01-02T03:05:05.000Z')
    const resultCreatedAt = new Date('2026-01-02T03:05:00.000Z')
    expect(
      regressionRunDetailProjection({
        id: 'run-id',
        workspaceId: 'workspace-id',
        workflowId: 'workflow-id',
        workflowVersionId: 'version-id',
        trigger: 'manual',
        startedAt,
        completedAt,
        passed: 1,
        failed: 0,
        total: 1,
        costMicros: 42n,
        results: [
          {
            id: 'result-id',
            runId: 'run-id',
            workspaceId: 'workspace-id',
            caseId: 'case-id',
            status: 'passed',
            score: 1,
            output: 'hello',
            costMicros: 42n,
            createdAt: resultCreatedAt,
          },
        ],
      }),
    ).toEqual({
      id: 'run-id',
      workflowId: 'workflow-id',
      workflowVersionId: 'version-id',
      trigger: 'manual',
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      passed: 1,
      failed: 0,
      total: 1,
      costMicros: '42',
      results: [
        {
          id: 'result-id',
          runId: 'run-id',
          caseId: 'case-id',
          status: 'passed',
          score: 1,
          output: 'hello',
          costMicros: '42',
          createdAt: resultCreatedAt.toISOString(),
        },
      ],
    })
  })
})
