import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import { EvalRunQueueService } from '../queue/eval-run-queue.service'
import { EvalRunsService } from './eval-runs.service'

afterAll(async () => {
  await pool.end()
})

async function withOrg(fn: (workspaceId: string) => Promise<void>) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'Eval Runs Service Test Org',
      slug: `eval-runs-service-${suffix}`,
      createdAt: new Date(),
    })
    .returning()

  try {
    await fn(organization.id)
  } finally {
    await pool.query('DELETE FROM organizations WHERE id = $1', [
      organization.id,
    ])
  }
}

describe('EvalRunsService', () => {
  it('lists and gets runs with their results, scoped to the workflow', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EvalRunsService, EvalRunQueueService],
    }).compile()
    const service = moduleRef.get(EvalRunsService)

    try {
      await withOrg(async (workspaceId) => {
        const suffix = randomUUID()
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Eval Runs Test Workflow',
          slug: `eval-runs-test-${suffix}`,
        })
        const otherWorkflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Eval Runs Test Other Workflow',
          slug: `eval-runs-test-other-${suffix}`,
        })
        const version = await repositories.workflow.createWorkflowVersion(db, {
          workflowId: workflow.id,
          graph: { nodes: [], edges: [] },
          contentHash: `eval-runs-test-hash-${suffix}`,
        })

        const run = await repositories.evalRun.createEvalRun(db, {
          workspaceId,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: 'manual',
        })
        await repositories.evalRun.insertEvalResults(db, run.id, workspaceId, [
          {
            caseId: randomUUID(),
            status: 'passed',
            score: 1,
            output: { text: 'ok' },
            costMicros: 10n,
          },
        ])
        await repositories.evalRun.completeEvalRun(db, run.id, {
          passed: 1,
          failed: 0,
          total: 1,
          costMicros: 10n,
        })

        const list = await service.list(workspaceId, workflow.id, {})
        expect(list.map((r) => r.id)).toEqual([run.id])

        const detail = await service.get(workspaceId, workflow.id, run.id)
        expect(detail.results).toHaveLength(1)
        expect(detail.results[0].status).toBe('passed')

        // Not visible under the wrong workflow, even in the same workspace.
        await expect(
          service.get(workspaceId, otherWorkflow.id, run.id),
        ).rejects.toThrow()
      })
    } finally {
      await moduleRef.close()
    }
  })

  it('rejects triggering a run with no published version, and enqueues one once published', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EvalRunsService, EvalRunQueueService],
    }).compile()
    const service = moduleRef.get(EvalRunsService)

    try {
      await withOrg(async (workspaceId) => {
        const suffix = randomUUID()
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Eval Runs Trigger Test Workflow',
          slug: `eval-runs-trigger-test-${suffix}`,
        })
        const version = await repositories.workflow.createWorkflowVersion(db, {
          workflowId: workflow.id,
          graph: { nodes: [], edges: [] },
          contentHash: `eval-runs-trigger-test-hash-${suffix}`,
        })

        await expect(
          service.trigger(workspaceId, workflow.id, {}),
        ).rejects.toThrow()

        await repositories.workflow.publishWorkflowVersion(
          db,
          workflow.id,
          version.id,
        )

        const result = await service.trigger(workspaceId, workflow.id, {})
        expect(result).toEqual({ queued: true })
      })
    } finally {
      await moduleRef.close()
    }
  })
})
