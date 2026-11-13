import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { db, pool, repositories, schema } from '@linea/db'
import { createTestExecution, getTestApplicationId } from '@linea/db/testing'
import type { WorkflowStepReplayJob } from '@linea/queue'
import request from 'supertest'
import type { Server } from 'node:http'
import { z } from 'zod'
import { bigIntJsonReplacer } from '../common/bigint-json-replacer'
import { ExecutionsController } from './executions.controller'
import { ExecutionsService } from './executions.service'
import { RegressionCasesController } from '../regressions/regression-cases.controller'
import { RegressionCasesService } from '../regressions/regression-cases.service'
import { StepReplayQueueService } from '../queue/step-replay-queue.service'
import { generateApiKey } from '../auth/api-key.util'
import type { AuthenticatedRequest } from '../auth/workspace-auth.guard'

const traceSchema = z.object({
  traceContentRestricted: z.boolean(),
  steps: z.array(
    z.object({ status: z.string(), input: z.unknown(), output: z.unknown() }),
  ),
})

describe('End-User execution trace access', () => {
  let app: NestExpressApplication<Server>
  let workspaceId: string
  let workflowId: string
  let userIds: string[]
  let endUserExecutionId: string
  let endUserStepId: string
  let operatorExecutionId: string
  let operatorStepId: string
  const key = generateApiKey()
  const enqueue = jest.fn<Promise<void>, [WorkflowStepReplayJob]>()
  const memberAndKey = () => [
    { 'x-test-user': userIds[2] },
    { Authorization: `Bearer ${key.rawKey}` },
  ]
  function sessionFromTestUserHeader(
    req: AuthenticatedRequest,
    _res: unknown,
    next: () => void,
  ) {
    const userId = req.headers['x-test-user']
    if (typeof userId === 'string')
      req.session = {
        user: { id: userId },
        session: { activeOrganizationId: workspaceId },
      }
    next()
  }
  const providerOutput = { issues: [{ title: 'Private roadmap' }] }
  async function insertStep(executionId: string) {
    const [step] = await db
      .insert(schema.executionSteps)
      .values({
        executionId,
        workspaceId,
        traceId: randomUUID(),
        spanId: randomUUID(),
        name: 'connector',
        nodeId: 'n1',
        sequence: 1,
        startedAt: new Date(),
        status: 'succeeded',
        input: { operation: 'github.issues.list' },
        output: providerOutput,
      })
      .returning()
    return step
  }
  beforeAll(async () => {
    const [workspace] = await db
      .insert(schema.organizations)
      .values({
        name: 'Trace access',
        slug: randomUUID(),
        createdAt: new Date(),
      })
      .returning()
    workspaceId = workspace.id
    const roles = ['owner', 'admin', 'member']
    const people = await db
      .insert(schema.users)
      .values(
        roles.map((name) => ({ name, email: `${randomUUID()}@test.dev` })),
      )
      .returning()
    userIds = people.map((user) => user.id)
    await db.insert(schema.members).values(
      people.map((user, i) => ({
        organizationId: workspaceId,
        userId: user.id,
        role: roles[i],
        createdAt: new Date(),
      })),
    )
    await db.insert(schema.apiKeys).values({
      workspaceId,
      name: 'Test',
      hashedKey: key.hashedKey,
      keyPrefix: key.keyPrefix,
    })
    const workflow = await repositories.workflow.createWorkflow(db, {
      workspaceId,
      applicationId: await getTestApplicationId(db, workspaceId),
      name: 'Trace access',
      slug: 'trace-access',
    })
    workflowId = workflow.id
    const version = await repositories.workflow.createWorkflowVersion(db, {
      workflowId,
      graph: {
        version: 1,
        trigger: { type: 'manual' },
        entryNodeId: 'n1',
        nodes: [{ id: 'n1', type: 'transform', config: {} }],
        edges: [],
      },
      contentHash: 'trace-access',
    })
    const endUserExecution = await createTestExecution(db, {
      workspaceId,
      workflowId,
      workflowVersionId: version.id,
      trigger: 'api',
      externalSubjectId: 'end-user-1',
    })
    endUserExecutionId = endUserExecution.id
    endUserStepId = (await insertStep(endUserExecutionId)).id
    const operatorExecution = await createTestExecution(db, {
      workspaceId,
      workflowId,
      workflowVersionId: version.id,
      trigger: 'manual',
    })
    operatorExecutionId = operatorExecution.id
    operatorStepId = (await insertStep(operatorExecutionId)).id
    await pool.query(
      "UPDATE executions SET status = 'succeeded' WHERE id = ANY($1)",
      [[endUserExecutionId, operatorExecutionId]],
    )
    const moduleRef = await Test.createTestingModule({
      controllers: [ExecutionsController, RegressionCasesController],
      providers: [
        ExecutionsService,
        RegressionCasesService,
        { provide: StepReplayQueueService, useValue: { enqueue } },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication<Server>>()
    app.use(sessionFromTestUserHeader)
    app.set('json replacer', bigIntJsonReplacer)
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
    await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds])
    await pool.end()
  })
  it('hides End-User step input and output from members and workspace keys but not from admins or owners', async () => {
    const server = app.getHttpServer()
    const [ownerId, adminId] = userIds
    for (const auth of memberAndKey()) {
      const response = await request(server)
        .get(`/workspace/executions/${endUserExecutionId}`)
        .set(auth)
        .expect(200)
      const trace = traceSchema.parse(response.body)
      expect(trace.traceContentRestricted).toBe(true)
      expect(trace.steps).toEqual([
        { status: 'succeeded', input: null, output: null },
      ])
      expect(JSON.stringify(response.body)).not.toContain('Private roadmap')
    }
    for (const userId of [ownerId, adminId]) {
      const response = await request(server)
        .get(`/workspace/executions/${endUserExecutionId}`)
        .set({ 'x-test-user': userId })
        .expect(200)
      const trace = traceSchema.parse(response.body)
      expect(trace.traceContentRestricted).toBe(false)
      expect(trace.steps[0].output).toEqual(providerOutput)
    }
  })
  it('keeps full trace content for members on executions without an End User', async () => {
    const response = await request(app.getHttpServer())
      .get(`/workspace/executions/${operatorExecutionId}`)
      .set({ 'x-test-user': userIds[2] })
      .expect(200)
    const trace = traceSchema.parse(response.body)
    expect(trace.traceContentRestricted).toBe(false)
    expect(trace.steps[0].output).toEqual(providerOutput)
  })
  it('refuses members and workspace keys a regression case from an End-User step', async () => {
    const server = app.getHttpServer()
    for (const auth of memberAndKey()) {
      await request(server)
        .post(`/workflows/${workflowId}/regression-cases/from-step`)
        .set(auth)
        .send({ stepId: endUserStepId })
        .expect(403)
    }
    expect(
      await repositories.regressionCase.listRegressionCases(
        db,
        workspaceId,
        workflowId,
        { includeArchived: true },
      ),
    ).toEqual([])
    await request(server)
      .post(`/workflows/${workflowId}/regression-cases/from-step`)
      .set({ 'x-test-user': userIds[1] })
      .send({ stepId: endUserStepId })
      .expect(201)
  })
  it('refuses members and workspace keys a replay of an End-User step so an overridden URL cannot receive its input', async () => {
    const server = app.getHttpServer()
    const overrideConfig = { url: 'https://attacker.test', method: 'POST' }
    for (const auth of memberAndKey()) {
      await request(server)
        .post(`/executions/${endUserExecutionId}/steps/${endUserStepId}/replay`)
        .set(auth)
        .send({ overrideConfig })
        .expect(403)
    }
    expect(enqueue).not.toHaveBeenCalled()
    await request(server)
      .post(`/executions/${operatorExecutionId}/steps/${operatorStepId}/replay`)
      .set({ 'x-test-user': userIds[2] })
      .send({})
      .expect(201)
    await request(server)
      .post(`/executions/${endUserExecutionId}/steps/${endUserStepId}/replay`)
      .set({ 'x-test-user': userIds[1] })
      .send({})
      .expect(201)
    expect(enqueue.mock.calls.map(([job]) => job.originalStepId)).toEqual([
      operatorStepId,
      endUserStepId,
    ])
  })
})
