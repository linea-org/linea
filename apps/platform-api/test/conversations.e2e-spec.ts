import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import request from 'supertest'
import type { App } from 'supertest/types'
import { z } from 'zod'
import { generateApiKey } from '../src/auth/api-key.util'
import { PlatformApiKeyGuard } from '../src/auth/platform-api-key.guard'
import { WorkspaceAuthGuard } from '../src/auth/workspace-auth.guard'
import { ConversationSessionTokenService } from '../src/conversations/conversation-session-token.service'
import { ConversationsController } from '../src/conversations/conversations.controller'
import { ConversationsService } from '../src/conversations/conversations.service'
import { WorkflowQueueService } from '../src/queue/workflow-queue.service'

const graph: WorkflowGraph = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'n1',
  nodes: [{ id: 'n1', type: 'transform', config: {} }],
  edges: [],
}

const sendConversationResponseSchema = z.object({
  conversationId: z.string(),
  externalSubjectId: z.string(),
  execution: z.object({ environment: z.literal('production') }),
  sessionToken: z.string(),
  sessionExpiresAt: z.number(),
})

describe('Production conversations API (e2e)', () => {
  let app: INestApplication<App>
  let sessionTokens: ConversationSessionTokenService
  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??=
      'a-test-secret-long-enough-to-sign-conversation-sessions'
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        ConversationsService,
        ConversationSessionTokenService,
        WorkspaceAuthGuard,
        PlatformApiKeyGuard,
        {
          provide: WorkflowQueueService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    sessionTokens = moduleRef.get(ConversationSessionTokenService)
    await app.init()
  })
  afterAll(async () => {
    await app.close()
    await pool.end()
  })
  it('accepts a platform key, persists the turn, and rejects an ingest key', async () => {
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const platformKey = generateApiKey()
    const ingestKey = generateApiKey()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Conversations API Test',
        slug: `conversations-api-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Conversations API Workflow',
        slug: `conversations-api-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: `conversations-api-${suffix}`,
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id,
      )
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Platform key',
        purpose: 'platform',
        hashedKey: platformKey.hashedKey,
        keyPrefix: platformKey.keyPrefix,
      })
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Ingest key',
        purpose: 'ingest',
        hashedKey: ingestKey.hashedKey,
        keyPrefix: ingestKey.keyPrefix,
      })
      const path = `/workflows/${workflow.id}/conversations/${conversationId}/messages`
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${ingestKey.rawKey}`)
        .send({ externalSubjectId: 'customer-42', message: 'hello' })
        .expect(401)
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${platformKey.rawKey}`)
        .send({ externalSubjectId: 'customer-42', message: 'hello' })
        .expect(201)
      const body = sendConversationResponseSchema.parse(response.body)
      expect(body).toMatchObject({
        conversationId,
        externalSubjectId: 'customer-42',
        execution: { environment: 'production' },
      })
      expect(sessionTokens.verify(body.sessionToken)).toEqual({
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        externalSubjectId: 'customer-42',
        expiresAt: body.sessionExpiresAt,
      })
      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId,
      )
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        role: 'user',
        content: 'hello',
        externalSubjectId: 'customer-42',
      })
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })
})
