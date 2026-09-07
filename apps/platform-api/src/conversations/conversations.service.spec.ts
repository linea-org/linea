import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import { WorkflowQueueService } from '../queue/workflow-queue.service'
import { ConversationSessionTokenService } from './conversation-session-token.service'
import { ConversationsService } from './conversations.service'

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

describe('ConversationsService', () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET ??=
      'a-test-secret-long-enough-to-sign-conversation-sessions'
  })
  it('persists production turns and mints a fresh tuple-scoped token on every message', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined)
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        ConversationSessionTokenService,
        { provide: WorkflowQueueService, useValue: { enqueue } },
      ],
    }).compile()
    const service = moduleRef.get(ConversationsService)
    const tokenService = moduleRef.get(ConversationSessionTokenService)
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Production Conversation Test',
        slug: `production-conversation-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Published Conversation Workflow',
        slug: `published-conversation-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: `conversation-${suffix}`,
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id,
      )
      const first = await service.sendMessage(
        organization.id,
        workflow.id,
        conversationId,
        { externalSubjectId: 'customer-42', message: 'hello' },
      )
      const second = await service.sendMessage(
        organization.id,
        workflow.id,
        conversationId,
        { externalSubjectId: 'customer-42', message: 'follow up' },
      )
      expect(first.sessionToken).not.toBe(second.sessionToken)
      expect(tokenService.verify(second.sessionToken)).toEqual({
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        externalSubjectId: 'customer-42',
        expiresAt: second.sessionExpiresAt,
      })
      expect(first.execution.environment).toBe('production')
      expect(first.execution.triggerPayload).toMatchObject({
        conversationId,
        externalSubjectId: 'customer-42',
      })
      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId,
      )
      expect(messages.map((message) => message.content)).toEqual([
        'hello',
        'follow up',
      ])
      expect(
        messages.every(
          (message) => message.externalSubjectId === 'customer-42',
        ),
      ).toBe(true)
      expect(enqueue).toHaveBeenCalledTimes(2)
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })
  it('rejects a different subject on an established conversation', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        ConversationSessionTokenService,
        {
          provide: WorkflowQueueService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(ConversationsService)
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Conversation Subject Test',
        slug: `conversation-subject-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Conversation Subject Workflow',
        slug: `conversation-subject-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: `conversation-subject-${suffix}`,
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id,
      )
      await service.sendMessage(organization.id, workflow.id, conversationId, {
        externalSubjectId: 'customer-42',
        message: 'hello',
      })
      await expect(
        service.sendMessage(organization.id, workflow.id, conversationId, {
          externalSubjectId: 'customer-99',
          message: 'not my conversation',
        }),
      ).rejects.toThrow('Conversation belongs to a different external subject')
      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId,
      )
      expect(messages).toHaveLength(1)
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })
  it('rejects an unpublished workflow without persisting a conversation', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        ConversationSessionTokenService,
        {
          provide: WorkflowQueueService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(ConversationsService)
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Unpublished Conversation Test',
        slug: `unpublished-conversation-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Unpublished Conversation Workflow',
        slug: `unpublished-conversation-workflow-${suffix}`,
      })
      await expect(
        service.sendMessage(organization.id, workflow.id, conversationId, {
          externalSubjectId: 'customer-42',
          message: 'hello',
        }),
      ).rejects.toThrow('Workflow has no published version')
      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId,
      )
      expect(messages).toEqual([])
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })
})
