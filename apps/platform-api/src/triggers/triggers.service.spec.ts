import '../env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import { TriggersService } from './triggers.service'
import { WorkflowQueueService } from '../queue/workflow-queue.service'

afterAll(async () => {
  await pool.end()
})

const graph: WorkflowGraph = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'n1',
  nodes: [{ id: 'n1', type: 'transform', config: {} }],
  edges: [],
}

describe('TriggersService', () => {
  it('resolves a workflow by slug within the workspace and triggers it', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TriggersService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(TriggersService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Triggers Test Org',
        slug: `triggers-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [otherOrg] = await db
      .insert(schema.organizations)
      .values({
        name: 'Other Org',
        slug: `other-org-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Webhook Workflow',
        slug: `webhook-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: 'test-hash',
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id,
      )

      // Same slug, different workspace — must not resolve across tenants.
      await expect(
        service.trigger(otherOrg.id, workflow.slug, undefined),
      ).rejects.toThrow()

      const execution = await service.trigger(organization.id, workflow.slug, {
        source: 'github',
      })
      expect(execution.trigger).toBe('webhook')
      expect(execution.triggerPayload).toEqual({ source: 'github' })
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
        organization.id,
        otherOrg.id,
      ])
    }
  })

  it('rejects triggering an unpublished workflow', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TriggersService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(TriggersService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Triggers Unpublished Test Org',
        slug: `triggers-unpublished-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Unpublished Webhook Workflow',
        slug: `unpublished-webhook-${suffix}`,
      })

      await expect(
        service.trigger(organization.id, workflow.slug, undefined),
      ).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })
})
