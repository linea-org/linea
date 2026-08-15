import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import { ApprovalsService } from './approvals.service'
import { WorkflowQueueService } from '../queue/workflow-queue.service'

afterAll(async () => {
  await pool.end()
})

async function setup() {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'Approvals Test Org',
      slug: `approvals-test-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Approvals Test User',
      email: `approvals-test-${suffix}@test.dev`,
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: 'Approvals Test Workflow',
    slug: `approvals-test-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: 'approvals-test-hash',
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: 'manual',
  })
  await pool.query(
    "UPDATE executions SET status = 'paused', leased_by = NULL, lease_expires_at = NULL WHERE id = $1",
    [execution.id],
  )
  const approval = await repositories.approval.createApproval(db, {
    workspaceId: organization.id,
    executionId: execution.id,
    nodeId: 'approval-1',
    message: 'Ship it?',
  })
  return { organization, user, execution, approval: approval! }
}

describe('ApprovalsService', () => {
  it('lists a pending approval for a member with no approverEmails restriction', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ApprovalsService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(ApprovalsService)

    const { organization, user, approval } = await setup()
    try {
      const pending = await service.list(user.id, organization.id)
      expect(pending.map((a) => a.id)).toContain(approval.id)
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    }
  })

  it('responding resolves the approval, re-queues the execution, and rejects a second response', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ApprovalsService, WorkflowQueueService],
    }).compile()
    const service = moduleRef.get(ApprovalsService)

    const { organization, user, execution, approval } = await setup()
    try {
      const resolved = await service.respond(
        user.id,
        organization.id,
        approval.id,
        { approved: true, comment: 'looks good' },
      )
      expect(resolved).toMatchObject({
        status: 'approved',
        respondedBy: user.id,
        comment: 'looks good',
      })

      const reloaded = await repositories.execution.getExecutionById(
        db,
        execution.id,
      )
      expect(reloaded?.status).toBe('queued')

      await expect(
        service.respond(user.id, organization.id, approval.id, {
          approved: false,
        }),
      ).rejects.toThrow('Approval not found or already responded to')
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    }
  })
})
