import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import request from 'supertest'
import type { App } from 'supertest/types'
import { generateApiKey } from '../src/auth/api-key.util'
import { WorkspaceAuthGuard } from '../src/auth/workspace-auth.guard'
import { bigIntJsonReplacer } from '../src/common/bigint-json-replacer'
import { ConversationAnalysesController } from '../src/conversation-analyses/conversation-analyses.controller'
import { ConversationAnalysesService } from '../src/conversation-analyses/conversation-analyses.service'

describe('Conversation analyses API (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationAnalysesController],
      providers: [ConversationAnalysesService, WorkspaceAuthGuard],
    }).compile()
    app = moduleRef.createNestApplication()
    const expressApp = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: unknown) => void
    }
    expressApp.set('json replacer', bigIntJsonReplacer)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  it('returns the latest complete analysis with its transcript and cited evidence', async () => {
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const generatedKey = generateApiKey()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Analysis API Test',
        slug: `analysis-api-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Support Agent',
        slug: `support-agent-${suffix}`,
      })
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Analysis API Test',
        purpose: 'platform',
        hashedKey: generatedKey.hashedKey,
        keyPrefix: generatedKey.keyPrefix,
      })
      const userMessage = await repositories.chatMessage.createChatMessage(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: 'user',
        content: 'You have repeated the same answer three times.',
        externalSubjectId: 'customer-42',
      })
      const assistantMessage = await repositories.chatMessage.createChatMessage(
        db,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: 'assistant',
          content: 'Please try the same steps again.',
          externalSubjectId: 'customer-42',
          respondsToMessageId: userMessage.id,
        },
      )
      await repositories.conversationAnalysis.createConversationAnalysis(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        externalSubjectId: 'customer-42',
        analyzedThroughSequence: userMessage.sequence,
        analyzerVersion: 'v1',
        model: 'older-model',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      const analysis =
        await repositories.conversationAnalysis.createConversationAnalysis(db, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          externalSubjectId: 'customer-42',
          analyzedThroughSequence: assistantMessage.sequence,
          analyzerVersion: 'v2',
          model: 'openai/gpt-oss-20b',
          costMicros: 19n,
        })
      await pool.query(
        'UPDATE conversation_analyses SET provider = $1, tokens_input = $2, tokens_output = $3 WHERE id = $4',
        ['groq', 120, 24, analysis.id],
      )
      await repositories.conversationAnalysis.insertConversationFindings(
        db,
        analysis.id,
        [
          {
            workspaceId: organization.id,
            axis: 'agent_behaviour',
            category: 'repetition_loop',
            confidence: 0.94,
            evidenceMessageId: userMessage.id,
            rationale: 'The user explicitly reports repeated failed advice.',
          },
        ],
      )
      const response = await request(app.getHttpServer())
        .get(
          `/workflows/${workflow.id}/conversations/${conversationId}/analysis`,
        )
        .set('Authorization', `Bearer ${generatedKey.rawKey}`)
        .expect(200)
      expect(response.body).toMatchObject({
        status: 'complete',
        conversation: {
          id: conversationId,
          externalSubjectId: 'customer-42',
          messages: [
            {
              id: userMessage.id,
              role: 'user',
              content: 'You have repeated the same answer three times.',
            },
            {
              id: assistantMessage.id,
              role: 'assistant',
              content: 'Please try the same steps again.',
            },
          ],
        },
        analysis: {
          id: analysis.id,
          analyzerVersion: 'v2',
          model: 'openai/gpt-oss-20b',
          provider: 'groq',
          tokensInput: 120,
          tokensOutput: 24,
          analyzedThroughSequence: assistantMessage.sequence,
          costMicros: '19',
        },
        findings: [
          {
            axis: 'agent_behaviour',
            category: 'repetition_loop',
            confidence: 0.94,
            evidenceMessageId: userMessage.id,
            rationale: 'The user explicitly reports repeated failed advice.',
          },
        ],
      })
    } finally {
      await pool.query('DELETE FROM chat_messages WHERE workspace_id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('distinguishes disabled analysis from an enabled analysis that is pending', async () => {
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const generatedKey = generateApiKey()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Pending Analysis API Test',
        slug: `pending-analysis-api-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Pending Support Agent',
        slug: `pending-support-agent-${suffix}`,
      })
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Pending Analysis API Test',
        purpose: 'platform',
        hashedKey: generatedKey.hashedKey,
        keyPrefix: generatedKey.keyPrefix,
      })
      const message = await repositories.chatMessage.createChatMessage(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: 'user',
        content: 'Can you help me?',
        externalSubjectId: 'customer-43',
      })
      const disabledResponse = await request(app.getHttpServer())
        .get(
          `/workflows/${workflow.id}/conversations/${conversationId}/analysis`,
        )
        .set('Authorization', `Bearer ${generatedKey.rawKey}`)
        .expect(200)
      expect(disabledResponse.body).toMatchObject({
        status: 'disabled',
        analysis: null,
        findings: [],
      })
      await repositories.workspaceSettings.updateWorkspaceSettings(
        db,
        organization.id,
        { behaviourAnalysisEnabled: true },
      )
      const response = await request(app.getHttpServer())
        .get(
          `/workflows/${workflow.id}/conversations/${conversationId}/analysis`,
        )
        .set('Authorization', `Bearer ${generatedKey.rawKey}`)
        .expect(200)
      expect(response.body).toMatchObject({
        status: 'pending',
        conversation: {
          id: conversationId,
          externalSubjectId: 'customer-43',
          messages: [
            {
              id: message.id,
              role: 'user',
              content: 'Can you help me?',
            },
          ],
        },
        analysis: null,
        findings: [],
      })
    } finally {
      await pool.query('DELETE FROM chat_messages WHERE workspace_id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('distinguishes a sampled-out conversation from an analyzed conversation with no findings', async () => {
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const analyzedConversationId = randomUUID()
    const generatedKey = generateApiKey()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Sampled Analysis API Test',
        slug: `sampled-analysis-api-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Sampled Support Agent',
        slug: `sampled-support-agent-${suffix}`,
      })
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Sampled Analysis API Test',
        purpose: 'platform',
        hashedKey: generatedKey.hashedKey,
        keyPrefix: generatedKey.keyPrefix,
      })
      const message = await repositories.chatMessage.createChatMessage(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: 'user',
        content: 'Thank you, that solved it.',
      })
      await repositories.conversationAnalysis.createConversationAnalysis(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        analyzedThroughSequence: message.sequence,
        analyzerVersion: 'sampled-out',
      })
      const analyzedMessage = await repositories.chatMessage.createChatMessage(
        db,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: analyzedConversationId,
          role: 'user',
          content: 'This conversation had no notable behavior.',
        },
      )
      await repositories.conversationAnalysis.createConversationAnalysis(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId: analyzedConversationId,
        analyzedThroughSequence: analyzedMessage.sequence,
        analyzerVersion: 'v2',
        model: 'openai/gpt-oss-20b',
      })
      const sampledResponse = await request(app.getHttpServer())
        .get(
          `/workflows/${workflow.id}/conversations/${conversationId}/analysis`,
        )
        .set('Authorization', `Bearer ${generatedKey.rawKey}`)
        .expect(200)
      expect(sampledResponse.body).toMatchObject({
        status: 'sampled_out',
        analysis: {
          analyzerVersion: 'sampled-out',
          model: null,
          costMicros: '0',
        },
        findings: [],
      })
      const analyzedResponse = await request(app.getHttpServer())
        .get(
          `/workflows/${workflow.id}/conversations/${analyzedConversationId}/analysis`,
        )
        .set('Authorization', `Bearer ${generatedKey.rawKey}`)
        .expect(200)
      expect(analyzedResponse.body).toMatchObject({
        status: 'complete',
        analysis: {
          analyzerVersion: 'v2',
          model: 'openai/gpt-oss-20b',
        },
        findings: [],
      })
    } finally {
      await pool.query('DELETE FROM chat_messages WHERE workspace_id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('returns unavailable when an analysis attempt expired without producing a result', async () => {
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const generatedKey = generateApiKey()
    const failedAt = new Date(Date.now() - 10 * 60_000)
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Unavailable Analysis API Test',
        slug: `unavailable-analysis-api-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Unavailable Support Agent',
        slug: `unavailable-support-agent-${suffix}`,
      })
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Unavailable Analysis API Test',
        purpose: 'platform',
        hashedKey: generatedKey.hashedKey,
        keyPrefix: generatedKey.keyPrefix,
      })
      await repositories.workspaceSettings.updateWorkspaceSettings(
        db,
        organization.id,
        { behaviourAnalysisEnabled: true },
      )
      await repositories.chatMessage.createChatMessage(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: 'user',
        content: 'This conversation could not be analyzed.',
      })
      await db.insert(schema.conversationAnalysisClaims).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        claimedAt: failedAt,
        attemptCount: 2,
      })
      const response = await request(app.getHttpServer())
        .get(
          `/workflows/${workflow.id}/conversations/${conversationId}/analysis`,
        )
        .set('Authorization', `Bearer ${generatedKey.rawKey}`)
        .expect(200)
      expect(response.body).toMatchObject({
        status: 'unavailable',
        analysis: null,
        findings: [],
        attempt: {
          attemptCount: 2,
          lastAttemptAt: failedAt.toISOString(),
        },
      })
    } finally {
      await pool.query(
        'DELETE FROM conversation_analysis_claims WHERE workspace_id = $1',
        [organization.id],
      )
      await pool.query('DELETE FROM chat_messages WHERE workspace_id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it("does not expose another workspace's conversation", async () => {
    const suffix = randomUUID()
    const conversationId = randomUUID()
    const generatedKey = generateApiKey()
    const [owner, requester] = await db
      .insert(schema.organizations)
      .values([
        {
          name: 'Analysis Owner',
          slug: `analysis-owner-${suffix}`,
          createdAt: new Date(),
        },
        {
          name: 'Analysis Requester',
          slug: `analysis-requester-${suffix}`,
          createdAt: new Date(),
        },
      ])
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: owner.id,
        name: 'Private Support Agent',
        slug: `private-support-agent-${suffix}`,
      })
      await repositories.apiKey.createApiKey(db, {
        workspaceId: requester.id,
        name: 'Analysis Requester Key',
        purpose: 'platform',
        hashedKey: generatedKey.hashedKey,
        keyPrefix: generatedKey.keyPrefix,
      })
      await repositories.chatMessage.createChatMessage(db, {
        workspaceId: owner.id,
        workflowId: workflow.id,
        conversationId,
        role: 'user',
        content: 'This belongs to another workspace.',
      })
      await request(app.getHttpServer())
        .get(
          `/workflows/${workflow.id}/conversations/${conversationId}/analysis`,
        )
        .set('Authorization', `Bearer ${generatedKey.rawKey}`)
        .expect(404)
    } finally {
      await pool.query('DELETE FROM chat_messages WHERE workspace_id = $1', [
        owner.id,
      ])
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
        owner.id,
        requester.id,
      ])
    }
  })
})
