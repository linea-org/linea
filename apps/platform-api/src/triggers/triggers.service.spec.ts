import '@linea/config/env'
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

  it('rejects triggering an archived workflow, even with a published version', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TriggersService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(TriggersService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Triggers Archived Test Org',
        slug: `triggers-archived-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Archived Webhook Workflow',
        slug: `archived-webhook-${suffix}`,
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
      await repositories.workflow.updateWorkflow(
        db,
        organization.id,
        workflow.id,
        {
          archivedAt: new Date(),
        },
      )

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

  it('marks the execution failed instead of stranding it queued when enqueueing fails', async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Triggers Enqueue Fail Test Org',
        slug: `triggers-enqueue-fail-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Enqueue Fail Webhook Workflow',
        slug: `enqueue-fail-webhook-${suffix}`,
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

      const failingQueue = {
        enqueue: () => Promise.reject(new Error('redis unreachable')),
      } as unknown as WorkflowQueueService
      const service = new TriggersService(failingQueue)

      await expect(
        service.trigger(organization.id, workflow.slug, undefined),
      ).rejects.toThrow()

      const list = await repositories.execution.listExecutions(db, workflow.id)
      expect(list).toHaveLength(1)
      expect(list[0].status).toBe('failed')
      expect(list[0].error).toEqual({ message: 'redis unreachable' })
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })
})
