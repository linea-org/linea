import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import { SignalsService } from './signals.service'

afterAll(async () => {
  await pool.end()
})

describe('SignalsService', () => {
  it('groups flags from the same pattern into one signal, scoped to its workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SignalsService],
    }).compile()
    const service = moduleRef.get(SignalsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Signals Test Org',
        slug: `signals-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [otherOrg] = await db
      .insert(schema.organizations)
      .values({
        name: 'Signals Test Other Org',
        slug: `signals-test-other-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Signals Test Workflow',
        slug: `signals-test-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: `signals-test-hash-${suffix}`,
      })
      const executionA = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: 'manual',
        triggerPayload: {},
      })
      const executionB = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: 'manual',
        triggerPayload: {},
      })

      await repositories.flag.createFlagIfNew(db, {
        workspaceId: organization.id,
        executionId: executionA.id,
        nodeId: 'n1',
        flagType: 'retry_storm',
        dedupeKey: `retry_storm:${executionA.id}:n1`,
      })
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: organization.id,
        executionId: executionB.id,
        nodeId: 'n1',
        flagType: 'retry_storm',
        dedupeKey: `retry_storm:${executionB.id}:n1`,
      })

      const signals = await service.list(organization.id)
      expect(signals).toHaveLength(1)
      expect(signals[0]).toMatchObject({ status: 'open', occurrenceCount: 2 })

      const detail = await service.get(organization.id, signals[0].id)
      expect(detail.flags).toHaveLength(2)

      // Not visible from another workspace.
      await expect(service.get(otherOrg.id, signals[0].id)).rejects.toThrow()

      const resolved = await service.resolve(organization.id, signals[0].id)
      expect(resolved.resolvedAt).not.toBeNull()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM organizations WHERE id = $1', [otherOrg.id])
    }
  })
})
