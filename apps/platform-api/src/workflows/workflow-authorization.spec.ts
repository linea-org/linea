import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { db, pool, repositories, schema } from '@linea/db'
import request from 'supertest'
import { z } from 'zod'
import type { Server } from 'node:http'
import { generateApiKey } from '../auth/api-key.util'
import type { AuthenticatedRequest } from '../auth/workspace-auth.guard'
import { RegressionRunQueueService } from '../queue/regression-run-queue.service'
import { RealtimeTokenService } from '../realtime/realtime-token.service'
import { WorkflowsGateway } from '../realtime/workflows.gateway'
import { WorkflowsController } from './workflows.controller'
import { WorkflowsService } from './workflows.service'

const createdId = z.object({ id: z.uuid() })

describe('Workflow publish and Production routing authorization', () => {
  let app: NestExpressApplication<Server>
  let workspaceId: string
  let applicationId: string
  let adminId: string
  let memberId: string
  let workflowId: string
  let versionId: string
  const key = generateApiKey()
  const regressionRunQueue = { enqueue: jest.fn(() => Promise.resolve()) }
  beforeAll(async () => {
    const [workspace] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workflow role policy',
        slug: randomUUID(),
        createdAt: new Date(),
      })
      .returning()
    workspaceId = workspace.id
    applicationId = (
      await repositories.application.createApplication(db, {
        workspaceId,
        name: 'Support',
        slug: 'support',
      })
    ).id
    async function seedUser(role: 'admin' | 'member') {
      const [user] = await db
        .insert(schema.users)
        .values({ name: role, email: `${randomUUID()}@test.dev` })
        .returning()
      await db.insert(schema.members).values({
        organizationId: workspaceId,
        userId: user.id,
        role,
        createdAt: new Date(),
      })
      return user.id
    }
    adminId = await seedUser('admin')
    memberId = await seedUser('member')
    await db.insert(schema.apiKeys).values({
      workspaceId,
      name: 'Test',
      hashedKey: key.hashedKey,
      keyPrefix: key.keyPrefix,
    })
    const moduleRef = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        WorkflowsService,
        { provide: RealtimeTokenService, useValue: {} },
        {
          provide: WorkflowsGateway,
          useValue: { broadcastDraftUpdate: jest.fn() },
        },
        { provide: RegressionRunQueueService, useValue: regressionRunQueue },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication<Server>>()
    app.use((req: AuthenticatedRequest, _res: unknown, next: () => void) => {
      const userId = req.headers['x-test-user']
      if (typeof userId === 'string')
        req.session = {
          user: { id: userId },
          session: { activeOrganizationId: workspaceId },
        }
      next()
    })
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
    await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
      adminId,
      memberId,
    ])
    await pool.end()
  })
  const member = () => ({ 'x-test-user': memberId })
  const admin = () => ({ 'x-test-user': adminId })
  const workspaceKey = () => ({ Authorization: `Bearer ${key.rawKey}` })
  async function storedWorkflow() {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) throw new Error('Workflow fixture missing')
    return workflow
  }
  it('keeps authoring open to members and workspace keys', async () => {
    const server = app.getHttpServer()
    const created = await request(server)
      .post('/workflows')
      .set(member())
      .send({ applicationId, name: 'Support triage', slug: 'triage' })
      .expect(201)
    workflowId = createdId.parse(created.body).id
    await request(server).get('/workflows').set(workspaceKey()).expect(200)
    await request(server)
      .put(`/workflows/${workflowId}/draft`)
      .set(member())
      .send({ graph: { nodes: [] } })
      .expect(200)
    const version = await request(server)
      .post(`/workflows/${workflowId}/versions`)
      .set(member())
      .send({
        graph: {
          version: 1,
          trigger: { type: 'manual' },
          entryNodeId: 'n1',
          nodes: [{ id: 'n1', type: 'transform', config: {} }],
          edges: [],
        },
      })
      .expect(201)
    versionId = createdId.parse(version.body).id
    for (const auth of [member(), workspaceKey()]) {
      await request(server)
        .patch(`/workflows/${workflowId}`)
        .set(auth)
        .send({ archived: true, slug: 'triage-next' })
        .expect(200)
      await request(server)
        .patch(`/workflows/${workflowId}`)
        .set(auth)
        .send({ archived: false, slug: 'triage' })
        .expect(200)
    }
  })
  it('lets only an admin session publish a version', async () => {
    const server = app.getHttpServer()
    for (const auth of [member(), workspaceKey()]) {
      await request(server)
        .post(`/workflows/${workflowId}/versions/${versionId}/publish`)
        .set(auth)
        .expect(403)
    }
    expect((await storedWorkflow()).publishedVersionId).toBeNull()
    expect(regressionRunQueue.enqueue).not.toHaveBeenCalled()
    await request(server)
      .post(`/workflows/${workflowId}/versions/${versionId}/publish`)
      .set(admin())
      .expect(201)
    expect((await storedWorkflow()).publishedVersionId).toBe(versionId)
    expect(regressionRunQueue.enqueue).toHaveBeenCalledTimes(1)
  })
  it('locks archive state and slug to admins once a Production binding exists', async () => {
    const server = app.getHttpServer()
    const environments = await repositories.environment.listEnvironments(
      db,
      workspaceId,
      applicationId,
    )
    const [contract] =
      await repositories.workflowContract.listWorkflowContractRevisions(
        db,
        workspaceId,
        workflowId,
      )
    async function bind(environment: 'dev' | 'production', enabled: boolean) {
      const target = environments.find((e) => e.environment === environment)
      if (!target) throw new Error(`${environment} Environment missing`)
      const result =
        await repositories.environmentWorkflowBinding.putEnvironmentWorkflowBinding(
          db,
          workspaceId,
          target.id,
          workflowId,
          {
            workflowVersionId: versionId,
            workflowContractRevisionId: contract.id,
            allowBackendStart: true,
            allowEndUserStart: false,
            enabled,
          },
        )
      if (result.outcome !== 'updated') throw new Error(result.outcome)
    }
    await bind('dev', true)
    await request(server)
      .patch(`/workflows/${workflowId}`)
      .set(member())
      .send({ slug: 'triage-dev' })
      .expect(200)
    await bind('production', false)
    for (const auth of [member(), workspaceKey()]) {
      for (const body of [
        { archived: true },
        { slug: 'triage-elsewhere' },
        { name: 'Renamed', slug: 'triage-elsewhere' },
      ]) {
        await request(server)
          .patch(`/workflows/${workflowId}`)
          .set(auth)
          .send(body)
          .expect(403)
      }
    }
    await bind('production', true)
    await request(server)
      .patch(`/workflows/${workflowId}`)
      .set(member())
      .send({ name: 'Renamed', slug: 'triage-dev', archived: false })
      .expect(200)
    await request(server)
      .patch(`/workflows/${workflowId}`)
      .set(workspaceKey())
      .send({ description: 'Routes inbound tickets' })
      .expect(200)
    expect(await storedWorkflow()).toMatchObject({
      name: 'Renamed',
      slug: 'triage-dev',
      archivedAt: null,
    })
    await request(server)
      .patch(`/workflows/${workflowId}`)
      .set(admin())
      .send({ slug: 'triage-live', archived: true })
      .expect(200)
    await request(server)
      .patch(`/workflows/${workflowId}`)
      .set(member())
      .send({ archived: false })
      .expect(403)
    expect((await storedWorkflow()).archivedAt).not.toBeNull()
    await request(server)
      .patch(`/workflows/${workflowId}`)
      .set(admin())
      .send({ archived: false })
      .expect(200)
    expect(await storedWorkflow()).toMatchObject({
      slug: 'triage-live',
      archivedAt: null,
    })
  })
  it('checks a member rename against an admin slug change that commits first', async () => {
    const admins = await pool.connect()
    let renamed: Promise<number> | undefined
    try {
      await admins.query('BEGIN')
      await admins.query('UPDATE workflows SET slug = $1 WHERE id = $2', [
        'triage-moved',
        workflowId,
      ])
      const { pid } = z
        .object({ pid: z.number() })
        .parse((await admins.query('SELECT pg_backend_pid() AS pid')).rows[0])
      renamed = request(app.getHttpServer())
        .patch(`/workflows/${workflowId}`)
        .set(member())
        .send({ name: 'Renamed again', slug: 'triage-live' })
        .then((response) => response.status)
      for (let attempt = 0; ; attempt++) {
        const waiting = await pool.query(
          'SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
          [pid],
        )
        if (waiting.rowCount) break
        if (attempt === 500)
          throw new Error('Rename never waited on the admin write')
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
      }
      await admins.query('COMMIT')
    } finally {
      admins.release()
    }
    expect(await renamed).toBe(403)
    expect(await storedWorkflow()).toMatchObject({
      name: 'Renamed',
      slug: 'triage-moved',
    })
  })
})
