import 'dotenv/config'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { db, pool, repositories } from '@linea/db'
import { getTestApplicationId, publishTestWorkflow } from '@linea/db/testing'
import request from 'supertest'
import type { Server } from 'node:http'
import { bigIntJsonReplacer } from '../common/bigint-json-replacer'
import { ExecutionsController } from './executions.controller'
import { ExecutionsService } from './executions.service'
import {
  deleteAuthorizationWorkspace,
  seedAuthorizationWorkspace,
  testUserSession,
} from './test-authorization-workspace'
import { TriggersController } from '../triggers/triggers.controller'
import { TriggersService } from '../triggers/triggers.service'
import { StepReplayQueueService } from '../queue/step-replay-queue.service'
import { generateApiKey } from '../auth/api-key.util'

describe('management start HTTP authorization', () => {
  let app: NestExpressApplication<Server>
  let workspaceId: string
  let workflowId: string
  let adminId: string
  let memberId: string
  let productionId: string
  let developmentId: string
  const key = generateApiKey()
  beforeAll(async () => {
    const seeded = await seedAuthorizationWorkspace('Start policy', key)
    workspaceId = seeded.workspaceId
    adminId = seeded.adminId
    memberId = seeded.memberId
    const workflow = await repositories.workflow.createWorkflow(db, {
      workspaceId,
      applicationId: await getTestApplicationId(db, workspaceId),
      name: 'Strict input',
      slug: 'strict',
    })
    workflowId = workflow.id
    const contract =
      await repositories.workflowContract.createWorkflowContractRevision(
        db,
        workspaceId,
        workflowId,
        {
          inputSchema: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
            additionalProperties: false,
          },
          outputSchema: { type: 'object' },
        },
      )
    if (contract.outcome !== 'created') throw new Error('Contract missing')
    const version = await repositories.workflow.createWorkflowVersion(db, {
      workflowId,
      workflowContractRevisionId: contract.revision.id,
      graph: { nodes: [], edges: [] },
      contentHash: 'strict',
    })
    await publishTestWorkflow(db, workflowId, version.id)
    const environments = await repositories.environment.listEnvironments(
      db,
      workspaceId,
      workflow.applicationId,
    )
    productionId = environments.find((e) => e.environment === 'production')!.id
    developmentId = environments.find((e) => e.environment === 'dev')!.id
    const moduleRef = await Test.createTestingModule({
      controllers: [ExecutionsController, TriggersController],
      providers: [
        ExecutionsService,
        TriggersService,
        { provide: StepReplayQueueService, useValue: {} },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication<Server>>()
    app.use(testUserSession(workspaceId))
    app.set('json replacer', bigIntJsonReplacer)
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
    await deleteAuthorizationWorkspace({ workspaceId, adminId, memberId })
    await pool.end()
  })
  it('rejects bad flags, payloads, members and workspace keys without execution or outbox writes, then accepts valid starts', async () => {
    const server = app.getHttpServer()
    const auths = [
      { 'x-test-user': memberId },
      { Authorization: `Bearer ${key.rawKey}` },
    ]
    for (const auth of auths) {
      await request(server)
        .post(`/workflows/${workflowId}/executions`)
        .set(auth)
        .send({ environment: 'production', triggerPayload: { message: 'ok' } })
        .expect(403)
      await request(server)
        .post(`/triggers/${productionId}/strict`)
        .set(auth)
        .send({ message: 'ok' })
        .expect(403)
    }
    for (const [environment, environmentId] of [
      ['dev', developmentId],
      ['production', productionId],
    ]) {
      await pool.query(
        'UPDATE environment_workflow_bindings SET allow_backend_start = false, allow_end_user_start = true WHERE workflow_id = $1',
        [workflowId],
      )
      await request(server)
        .post(`/workflows/${workflowId}/executions`)
        .set('x-test-user', adminId)
        .send({ environment, triggerPayload: { message: 'ok' } })
        .expect(403)
      await request(server)
        .post(`/triggers/${environmentId}/strict`)
        .set('x-test-user', adminId)
        .send({ message: 'ok' })
        .expect(403)
      await pool.query(
        'UPDATE environment_workflow_bindings SET allow_backend_start = true WHERE workflow_id = $1',
        [workflowId],
      )
      const manual = await request(server)
        .post(`/workflows/${workflowId}/executions`)
        .set('x-test-user', adminId)
        .send({ environment, triggerPayload: { message: 42 } })
        .expect(400)
      expect(manual.text).toContain('Workflow Contract')
      await request(server)
        .post(`/triggers/${environmentId}/strict`)
        .set('x-test-user', adminId)
        .send({})
        .expect(400)
    }
    expect(
      (
        await pool.query('SELECT id FROM executions WHERE workspace_id = $1', [
          workspaceId,
        ])
      ).rows,
    ).toHaveLength(0)
    expect(
      (
        await pool.query(
          'SELECT id FROM outbox_messages WHERE workspace_id = $1',
          [workspaceId],
        )
      ).rows,
    ).toHaveLength(0)
    await request(server)
      .post(`/workflows/${workflowId}/executions`)
      .set('x-test-user', adminId)
      .send({ environment: 'production', triggerPayload: { message: 'ok' } })
      .expect(201)
    await request(server)
      .post(`/triggers/${productionId}/strict`)
      .set('x-test-user', adminId)
      .send({ message: 'ok' })
      .expect(201)
    for (const auth of auths) {
      await request(server)
        .post(`/workflows/${workflowId}/executions`)
        .set(auth)
        .send({ triggerPayload: { message: 'ok' } })
        .expect(201)
      await request(server)
        .post(`/triggers/${developmentId}/strict`)
        .set(auth)
        .send({ message: 'ok' })
        .expect(201)
    }
    expect(
      (
        await pool.query(
          'SELECT id FROM outbox_messages WHERE workspace_id = $1',
          [workspaceId],
        )
      ).rows,
    ).toHaveLength(6)
  })
})
