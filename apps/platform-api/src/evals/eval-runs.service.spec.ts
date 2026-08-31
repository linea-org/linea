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
    })
      // Doesn't call trigger() below, so this never enqueues — mocked anyway so this suite never
      // depends on a real Redis connection, and never risks it (see the other test's own note).
      .overrideProvider(EvalRunQueueService)
      .useValue({
        enqueue: jest.fn(),
        onModuleDestroy: () => Promise.resolve(),
      })
      .compile()
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
        await repositories.evalRun.completeEvalRun(db, workspaceId, run.id, {
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
    const enqueue = jest.fn().mockResolvedValue(undefined)
    const moduleRef = await Test.createTestingModule({
      providers: [EvalRunsService, EvalRunQueueService],
    })
      // The real EvalRunQueueService would enqueue a real BullMQ job on the shared dev Redis —
      // a live execution-worker elsewhere would then pick it up and fail once this test's own
      // Postgres cleanup below deletes the workflow/version it referenced. Mocked so trigger()
      // is verified without touching real infrastructure at all.
      .overrideProvider(EvalRunQueueService)
      .useValue({ enqueue, onModuleDestroy: () => Promise.resolve() })
      .compile()
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
        expect(enqueue).toHaveBeenCalledWith({
          workspaceId,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: 'manual',
        })
      })
    } finally {
      await moduleRef.close()
    }
  })

  it('rejects an explicit workflowVersionId override that does not belong to this workflow, without enqueueing it', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined)
    const moduleRef = await Test.createTestingModule({
      providers: [EvalRunsService, EvalRunQueueService],
    })
      .overrideProvider(EvalRunQueueService)
      .useValue({ enqueue, onModuleDestroy: () => Promise.resolve() })
      .compile()
    const service = moduleRef.get(EvalRunsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Eval Runs Bad Version Test Org',
        slug: `eval-runs-bad-version-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [otherOrganization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Eval Runs Bad Version Test Other Org',
        slug: `eval-runs-bad-version-other-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Eval Runs Bad Version Test Workflow',
        slug: `eval-runs-bad-version-test-${suffix}`,
      })
      const otherWorkflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: otherOrganization.id,
        name: 'Eval Runs Bad Version Test Other Workflow',
        slug: `eval-runs-bad-version-test-other-${suffix}`,
      })
      const otherVersion = await repositories.workflow.createWorkflowVersion(
        db,
        {
          workflowId: otherWorkflow.id,
          graph: { nodes: [], edges: [] },
          contentHash: `eval-runs-bad-version-test-hash-${suffix}`,
        },
      )

      await expect(
        service.trigger(organization.id, workflow.id, {
          workflowVersionId: otherVersion.id,
        }),
      ).rejects.toThrow()
      expect(enqueue).not.toHaveBeenCalled()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        otherOrganization.id,
      ])
    }
  })
})
