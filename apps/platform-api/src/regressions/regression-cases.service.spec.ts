import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import { RegressionCasesService } from './regression-cases.service'

afterAll(async () => {
  await pool.end()
})

async function withOrg(fn: (workspaceId: string) => Promise<void>) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'Regression Cases Service Test Org',
      slug: `regression-cases-service-${suffix}`,
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

describe('RegressionCasesService', () => {
  it('creates a case from a step, lists it, and archives it, all scoped to the workflow', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RegressionCasesService],
    }).compile()
    const service = moduleRef.get(RegressionCasesService)

    try {
      await withOrg(async (workspaceId) => {
        const suffix = randomUUID()
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Regression Cases Test Workflow',
          slug: `regression-cases-test-${suffix}`,
        })
        const otherWorkflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Regression Cases Test Other Workflow',
          slug: `regression-cases-test-other-${suffix}`,
        })
        const version = await repositories.workflow.createWorkflowVersion(db, {
          workflowId: workflow.id,
          graph: { nodes: [], edges: [] },
          contentHash: `regression-cases-test-hash-${suffix}`,
        })
        const execution = await repositories.execution.createExecution(db, {
          workspaceId,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: 'manual',
        })
        const [step] = await db
          .insert(schema.executionSteps)
          .values({
            executionId: execution.id,
            workspaceId,
            traceId: randomUUID(),
            spanId: randomUUID(),
            name: 'transform',
            nodeId: 'n1',
            sequence: 1,
            startedAt: new Date(),
            input: { message: 'hello' },
          })
          .returning()

        // A step from another workflow in the same workspace must 404, not silently file the
        // case under the wrong workflow.
        await expect(
          service.createFromStep(workspaceId, otherWorkflow.id, {
            stepId: step.id,
          }),
        ).rejects.toThrow()

        const created = await service.createFromStep(workspaceId, workflow.id, {
          stepId: step.id,
        })
        expect(created.caseType).toBe('node')
        expect(created.workflowId).toBe(workflow.id)

        const list = await service.list(workspaceId, workflow.id, {})
        expect(list.map((c) => c.id)).toEqual([created.id])

        const archived = await service.archive(
          workspaceId,
          workflow.id,
          created.id,
        )
        expect(archived.archivedAt).not.toBeNull()

        const listAfterArchive = await service.list(
          workspaceId,
          workflow.id,
          {},
        )
        expect(listAfterArchive).toEqual([])
      })
    } finally {
      await moduleRef.close()
    }
  })

  it('creates a case from a flag, rejecting a flag with no conversation to snapshot and a flag from another workflow', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RegressionCasesService],
    }).compile()
    const service = moduleRef.get(RegressionCasesService)

    try {
      await withOrg(async (workspaceId) => {
        const suffix = randomUUID()
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Regression Cases Flag Test Workflow',
          slug: `regression-cases-flag-test-${suffix}`,
        })
        const otherWorkflow = await repositories.workflow.createWorkflow(db, {
          workspaceId,
          name: 'Regression Cases Flag Test Other Workflow',
          slug: `regression-cases-flag-test-other-${suffix}`,
        })
        const conversationId = randomUUID()
        const [turn] = await db
          .insert(schema.chatMessages)
          .values({
            workspaceId,
            workflowId: workflow.id,
            conversationId,
            role: 'user',
            content: 'What is your refund policy?',
          })
          .returning()

        const flagWithDetail = await repositories.flag.createFlagIfNew(db, {
          workspaceId,
          workflowId: workflow.id,
          flagType: 'hallucination_suspected',
          dedupeKey: `hallucination_suspected:${conversationId}`,
          detail: {
            conversationId,
            category: 'hallucination_suspected',
            evidenceMessageId: turn.id,
            rationale: 'test rationale',
          },
        })
        const flagWithoutDetail = await repositories.flag.createFlagIfNew(db, {
          workspaceId,
          workflowId: workflow.id,
          flagType: 'retry_storm',
          dedupeKey: `retry_storm:${randomUUID()}`,
        })

        await expect(
          service.createFromFlag(workspaceId, workflow.id, {
            flagId: flagWithoutDetail!.id,
          }),
        ).rejects.toThrow()

        await expect(
          service.createFromFlag(workspaceId, otherWorkflow.id, {
            flagId: flagWithDetail!.id,
          }),
        ).rejects.toThrow()

        const created = await service.createFromFlag(workspaceId, workflow.id, {
          flagId: flagWithDetail!.id,
        })
        expect(created.caseType).toBe('conversation')
        expect(created.workflowId).toBe(workflow.id)
      })
    } finally {
      await moduleRef.close()
    }
  })
})
