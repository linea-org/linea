import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import { RegressionRunQueueService } from '../queue/regression-run-queue.service'
import { RegressionRunsService } from './regression-runs.service'

afterAll(async () => {
  await pool.end()
})

async function withOrg(fn: (workspaceId: string) => Promise<void>) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'Regression Runs Service Test Org',
      slug: `regression-runs-service-${suffix}`,
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

describe('RegressionRunsService', () => {
  it('lists and gets runs with their results, scoped to the workflow', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RegressionRunsService, RegressionRunQueueService],
    })
      // Doesn't call trigger() below, so this never enqueues — mocked anyway so this suite never
      // depends on a real Redis connection, and never risks it (see the other test's own note).
      .overrideProvider(RegressionRunQueueService)
      .useValue({
        enqueue: jest.fn(),
        onModuleDestroy: () => Promise.resolve(),
      })
      .compile()
    const service = moduleRef.get(RegressionRunsService)

    try {
      await withOrg(async (workspaceId) => {
        const suffix = randomUUID()
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Regression Runs Test Workflow',
          slug: `regression-runs-test-${suffix}`,
        })
        const otherWorkflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Regression Runs Test Other Workflow',
          slug: `regression-runs-test-other-${suffix}`,
        })
        const version = await repositories.workflow.createWorkflowVersion(db, {
          workflowId: workflow.id,
          graph: { nodes: [], edges: [] },
          contentHash: `regression-runs-test-hash-${suffix}`,
        })

        const run = await repositories.regressionRun.createRegressionRun(db, {
          workspaceId,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: 'manual',
        })
        await repositories.regressionRun.insertRegressionResults(
          db,
          run.id,
          workspaceId,
          [
            {
              caseId: randomUUID(),
              status: 'passed',
              score: 1,
              output: { text: 'ok' },
              costMicros: 10n,
            },
          ],
        )
        await repositories.regressionRun.completeRegressionRun(
          db,
          workspaceId,
          run.id,
          {
            passed: 1,
            failed: 0,
            total: 1,
            costMicros: 10n,
          },
        )

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
      providers: [RegressionRunsService, RegressionRunQueueService],
    })
      // The real RegressionRunQueueService would enqueue a real BullMQ job on the shared dev Redis —
      // a live execution-worker elsewhere would then pick it up and fail once this test's own
      // Postgres cleanup below deletes the workflow/version it referenced. Mocked so trigger()
      // is verified without touching real infrastructure at all.
      .overrideProvider(RegressionRunQueueService)
      .useValue({ enqueue, onModuleDestroy: () => Promise.resolve() })
      .compile()
    const service = moduleRef.get(RegressionRunsService)

    try {
      await withOrg(async (workspaceId) => {
        const suffix = randomUUID()
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Regression Runs Trigger Test Workflow',
          slug: `regression-runs-trigger-test-${suffix}`,
        })
        const version = await repositories.workflow.createWorkflowVersion(db, {
          workflowId: workflow.id,
          graph: { nodes: [], edges: [] },
          contentHash: `regression-runs-trigger-test-hash-${suffix}`,
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
      providers: [RegressionRunsService, RegressionRunQueueService],
    })
      .overrideProvider(RegressionRunQueueService)
      .useValue({ enqueue, onModuleDestroy: () => Promise.resolve() })
      .compile()
    const service = moduleRef.get(RegressionRunsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Regression Runs Bad Version Test Org',
        slug: `regression-runs-bad-version-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [otherOrganization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Regression Runs Bad Version Test Other Org',
        slug: `regression-runs-bad-version-other-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Regression Runs Bad Version Test Workflow',
        slug: `regression-runs-bad-version-test-${suffix}`,
      })
      const otherWorkflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: otherOrganization.id,
        name: 'Regression Runs Bad Version Test Other Workflow',
        slug: `regression-runs-bad-version-test-other-${suffix}`,
      })
      const otherVersion = await repositories.workflow.createWorkflowVersion(
        db,
        {
          workflowId: otherWorkflow.id,
          graph: { nodes: [], edges: [] },
          contentHash: `regression-runs-bad-version-test-hash-${suffix}`,
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
