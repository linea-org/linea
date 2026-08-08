import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import { ExecutionsService } from './executions.service'
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

describe('ExecutionsService', () => {
  it('rejects triggering a workflow with no published version', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ExecutionsService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(ExecutionsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Executions Test Org',
        slug: `executions-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Unpublished Workflow',
        slug: `unpublished-${suffix}`,
      })

      await expect(
        service.trigger(organization.id, workflow.id, {}),
      ).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('triggers a published workflow, enqueues it, and lists/gets it back scoped to the workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ExecutionsService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(ExecutionsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Executions Trigger Test Org',
        slug: `executions-trigger-test-${suffix}`,
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
        name: 'Published Workflow',
        slug: `published-${suffix}`,
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

      const execution = await service.trigger(organization.id, workflow.id, {
        triggerPayload: { hello: 'world' },
      })
      expect(execution.status).toBe('queued')
      expect(execution.trigger).toBe('manual')

      const list = await service.list(organization.id, workflow.id)
      expect(list.map((e) => e.id)).toContain(execution.id)

      const workspaceList = await service.listWorkspace(organization.id, {})
      expect(workspaceList.executions.map((e) => e.id)).toContain(execution.id)
      expect(workspaceList.executions[0].workflowName).toBe(workflow.name)
      expect(workspaceList.total).toBeGreaterThanOrEqual(1)

      const filteredOut = await service.listWorkspace(organization.id, {
        status: 'succeeded',
      })
      expect(filteredOut.executions.map((e) => e.id)).not.toContain(
        execution.id,
      )

      expect(
        (await service.listWorkspace(otherOrg.id, {})).executions.map(
          (e) => e.id,
        ),
      ).not.toContain(execution.id)

      const found = await service.get(organization.id, execution.id)
      expect(found.execution.id).toBe(execution.id)
      expect(found.steps).toEqual([])

      await expect(service.get(otherOrg.id, execution.id)).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
        organization.id,
        otherOrg.id,
      ])
    }
  })

  it('rejects triggering an archived workflow, even with a published version', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ExecutionsService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(ExecutionsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Executions Archived Test Org',
        slug: `executions-archived-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Archived Workflow',
        slug: `archived-${suffix}`,
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
        service.trigger(organization.id, workflow.id, {}),
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
        name: 'Executions Enqueue Fail Test Org',
        slug: `executions-enqueue-fail-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Enqueue Fail Workflow',
        slug: `enqueue-fail-${suffix}`,
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
      const service = new ExecutionsService(failingQueue)

      await expect(
        service.trigger(organization.id, workflow.id, {}),
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
