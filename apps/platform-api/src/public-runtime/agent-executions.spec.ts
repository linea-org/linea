import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import {
  configureTestEnvironment,
  getTestApplicationId,
} from '@linea/db/testing'
import { publicExecutionSchema } from '@linea/protocol/resources'
import request from 'supertest'
import type { App } from 'supertest/types'
import { generateEnvironmentKey } from '../auth/api-key.util'
import { PublicRuntimeModule } from './public-runtime.module'

let app: INestApplication<App>
let workspaceId: string
let environmentId: string
let subjectId: string
let agentId: string
let versionId: string
let contractId: string
const key = generateEnvironmentKey()

beforeAll(async () => {
  const suffix = randomUUID()
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: 'Agent public API test',
      slug: suffix,
      createdAt: new Date(),
    })
    .returning()
  workspaceId = workspace.id
  const applicationId = await getTestApplicationId(db, workspaceId)
  const environment = await configureTestEnvironment(db, {
    workspaceId,
    applicationId,
    environment: 'dev',
    displayName: 'Agent API',
    allowedBrowserOrigins: ['http://localhost:3001'],
    allowedRedirectOrigins: ['http://localhost:3001'],
    oidcIssuer: 'https://identity.example.com',
    oidcClientId: suffix,
    oidcAudience: suffix,
    oidcJwksUrl: 'https://identity.example.com/jwks',
  })
  environmentId = environment.id
  const [subject] = await db
    .insert(schema.externalSubjects)
    .values({
      workspaceId,
      issuer: 'https://identity.example.com',
      issuerSubject: suffix,
      status: 'verified',
      verifiedAt: new Date(),
    })
    .returning()
  subjectId = subject.id
  await db
    .insert(schema.externalSubjectEnvironments)
    .values({ workspaceId, environmentId, externalSubjectId: subjectId })
  await db.insert(schema.environmentKeys).values({
    workspaceId,
    environmentId,
    name: 'Agent API test',
    scopes: ['executions:start', 'executions:read'],
    hashedKey: key.hashedKey,
    keyPrefix: key.keyPrefix,
  })
  const agent = await repositories.agent.createAgent(db, {
    workspaceId,
    applicationId,
    name: 'API Agent',
    slug: suffix,
  })
  if (!agent) throw new Error('Agent fixture failed')
  agentId = agent.id
  const contract = await repositories.agentContract.createAgentContractRevision(
    db,
    workspaceId,
    agentId,
    {
      inputSchema: {
        type: 'object',
        required: ['task'],
        properties: { task: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchema: { type: 'string' },
    },
  )
  if (contract.outcome !== 'created') throw new Error('Contract fixture failed')
  contractId = contract.revision.id
  const version = await repositories.agent.createAgentVersion(
    db,
    workspaceId,
    agentId,
    {
      agentContractRevisionId: contractId,
      definition: {
        version: 1,
        instructions: 'Answer the task',
        model: 'gpt-5',
        tools: [],
        maxIterations: 1,
      },
    },
  )
  if (version.outcome !== 'created') throw new Error('Version fixture failed')
  versionId = version.version.id
  await repositories.agent.publishAgentVersion(
    db,
    workspaceId,
    agentId,
    versionId,
  )
  const moduleRef = await Test.createTestingModule({
    imports: [PublicRuntimeModule],
  }).compile()
  app = moduleRef.createNestApplication()
  app.setGlobalPrefix('v1')
  await app.init()
})

afterAll(async () => {
  await app.close()
  await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
  await pool.end()
})

function start(body: Record<string, unknown>, idempotencyKey: string) {
  return request(app.getHttpServer())
    .post(`/v1/environments/${environmentId}/executions`)
    .set('Authorization', `Bearer ${key.rawKey}`)
    .set('Idempotency-Key', idempotencyKey)
    .send(body)
}

it('rejects undeployed, disabled, archived and invalid Agent requests before queuing any work', async () => {
  const body = {
    agentId,
    externalSubjectId: subjectId,
    input: { task: 'hello' },
  }
  await start(body, randomUUID()).expect(404)
  await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
    db,
    workspaceId,
    environmentId,
    agentId,
    {
      agentVersionId: versionId,
      agentContractRevisionId: contractId,
      enabled: false,
    },
  )
  await start(body, randomUUID()).expect(404)
  await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
    db,
    workspaceId,
    environmentId,
    agentId,
    {
      agentVersionId: versionId,
      agentContractRevisionId: contractId,
      enabled: true,
    },
  )
  await start({ ...body, input: { task: 1 } }, randomUUID()).expect(400)
  await start({ ...body, workflowId: randomUUID() }, randomUUID()).expect(400)
  await pool.query('UPDATE agents SET archived_at = now() WHERE id = $1', [
    agentId,
  ])
  await start(body, randomUUID()).expect(404)
  await pool.query('UPDATE agents SET archived_at = null WHERE id = $1', [
    agentId,
  ])
  const count = await pool.query<{ count: string }>(
    'SELECT count(*) FROM executions WHERE workspace_id = $1',
    [workspaceId],
  )
  expect(count.rows[0]?.count).toBe('0')
})

it('durably pins the selected version and Contract, replays the start, and returns its own root output', async () => {
  const body = {
    agentId,
    externalSubjectId: subjectId,
    input: { task: 'hello' },
  }
  const idempotencyKey = randomUUID()
  const response = await start(body, idempotencyKey).expect(202)
  const execution = publicExecutionSchema.parse(response.body)
  if (execution.workflowId !== null) throw new Error('Expected an Agent root')
  expect(execution.agentId).toBe(agentId)
  expect(execution.workflowId).toBeNull()
  const persisted = await repositories.execution.getExecutionById(
    db,
    execution.id,
  )
  expect(persisted?.agentVersionId).toBe(versionId)
  expect(persisted?.agentContractRevisionId).toBe(contractId)
  await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
    db,
    workspaceId,
    environmentId,
    agentId,
    {
      agentVersionId: versionId,
      agentContractRevisionId: contractId,
      enabled: false,
    },
  )
  const replay = await start(body, idempotencyKey).expect(202)
  expect(publicExecutionSchema.parse(replay.body).id).toBe(execution.id)
  await start({ ...body, input: { task: 'changed' } }, idempotencyKey).expect(
    409,
  )
  await repositories.execution.startExecution(
    db,
    execution.id,
    'agent-api-test',
    new Date(Date.now() + 60_000),
  )
  await repositories.execution.completeExecution(
    db,
    execution.id,
    'agent-api-test',
    {
      status: 'succeeded',
      output: 'hello',
      costMicros: 0n,
      costUnpriced: false,
      tokensInput: 0,
      tokensOutput: 0,
    },
  )
  const result = await request(app.getHttpServer())
    .get(`/v1/executions/${execution.id}`)
    .set('Authorization', `Bearer ${key.rawKey}`)
    .expect(200)
  expect(publicExecutionSchema.parse(result.body).output).toBe('hello')
})
