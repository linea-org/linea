import '@linea/config/env'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { pool } from '@linea/db'
import {
  approvalDecisionSchema,
  connectionUseSchema,
  connectionAuthorizationResponseSchema,
  connectionSchema,
  connectionsResponseSchema,
  endUserConnectorAuditEventSchema,
  operatorConnectorAuditEventSchema,
  pendingActionIntentSchema,
  publicExecutionSchema,
} from '@linea/protocol/resources'
import { paginatedResponseSchema } from '@linea/protocol/shared'
import request from 'supertest'
import type { App } from 'supertest/types'
import { CONNECTION_OAUTH_PROVIDERS } from '../src/connections/connection-oauth-provider'
import { ConnectionsModule } from '../src/connections/connections.module'
import { startTestGithubOAuthProvider } from '../src/connections/test-github-oauth-provider'
import { startTestGoogleProvider } from '../src/connections/test-google-provider'
import { PublicRuntimeModule } from '../src/public-runtime/public-runtime.module'
import {
  createConnectionsLaunchFixture,
  sessionHeaders,
  type LaunchFixture,
  type LaunchSession,
} from './connections-launch-fixture'
import { startConnectorApiProvider } from './connections-launch-provider'

jest.setTimeout(60_000)

type Worker = { process: ChildProcess; output: string[] }
type RateLimitSnapshot = {
  key: string
  requestCount: number
  expiresAt: Date
}

function startWorker(name: 'background-worker' | 'execution-worker'): Worker {
  const worker = spawn(
    process.execPath,
    [
      join(
        __dirname,
        `../../${name}/dist/${name === 'background-worker' ? 'src/' : ''}main.js`,
      ),
    ],
    { cwd: join(__dirname, '../../..'), env: process.env, stdio: 'pipe' },
  )
  const output: string[] = []
  worker.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()))
  worker.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()))
  return { process: worker, output }
}

async function stopWorker(worker: Worker | undefined): Promise<void> {
  if (
    !worker ||
    worker.process.exitCode !== null ||
    worker.process.signalCode !== null
  )
    return
  await new Promise<void>((resolve) => {
    worker.process.once('exit', () => resolve())
    worker.process.kill()
  })
}

function workerFailure(workers: Worker[]): string {
  return workers
    .map((worker) => worker.output.join('').slice(-4_000))
    .join('\n')
}

describe('Connections and Action Consent launch tracer', () => {
  let app: INestApplication<App>
  let baseUrl: string
  let fixture: LaunchFixture
  let google: Awaited<ReturnType<typeof startTestGoogleProvider>>
  let github: Awaited<ReturnType<typeof startTestGithubOAuthProvider>>
  let apiProvider: Awaited<ReturnType<typeof startConnectorApiProvider>>
  let backgroundWorker: Worker | undefined
  let executionWorker: Worker | undefined
  let googleConnectionId: string
  let githubConnectionId: string
  let rateLimitBaseline: Map<string, RateLimitSnapshot>

  beforeAll(async () => {
    google = await startTestGoogleProvider()
    github = await startTestGithubOAuthProvider()
    apiProvider = await startConnectorApiProvider()
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = 'connections-launch-v1'
    process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
      'connections-launch-v1': Buffer.alloc(32, 11).toString('base64'),
    })
    process.env.GOOGLE_CONNECTOR_API_BASE_URL = apiProvider.baseUrl
    process.env.GITHUB_API_BASE_URL = apiProvider.baseUrl
    const rateLimits = await pool.query<RateLimitSnapshot>(
      'SELECT key, request_count AS "requestCount", expires_at AS "expiresAt" FROM end_user_authorization_rate_limits',
    )
    rateLimitBaseline = new Map(rateLimits.rows.map((row) => [row.key, row]))
    fixture = await createConnectionsLaunchFixture()
    const moduleRef = await Test.createTestingModule({
      imports: [ConnectionsModule, PublicRuntimeModule],
    })
      .overrideProvider(CONNECTION_OAUTH_PROVIDERS)
      .useValue([google.adapter, github.adapter])
      .compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('v1')
    await app.listen(0)
    baseUrl = await app.getUrl()
    process.env.CONNECTION_OAUTH_CALLBACK_BASE_URL = baseUrl
  })

  afterAll(async () => {
    await stopWorker(backgroundWorker)
    await stopWorker(executionWorker)
    if (app) await app.close()
    if (google) await google.close()
    if (github) await github.close()
    if (apiProvider) await apiProvider.close()
    if (rateLimitBaseline) {
      const rateLimits = await pool.query<RateLimitSnapshot>(
        'SELECT key, request_count AS "requestCount", expires_at AS "expiresAt" FROM end_user_authorization_rate_limits',
      )
      for (const current of rateLimits.rows) {
        const baseline = rateLimitBaseline.get(current.key)
        if (
          baseline?.requestCount === current.requestCount &&
          baseline.expiresAt.getTime() === current.expiresAt.getTime()
        )
          continue
        if (baseline) {
          await pool.query(
            'UPDATE end_user_authorization_rate_limits SET request_count = $2, expires_at = $3 WHERE key = $1',
            [baseline.key, baseline.requestCount, baseline.expiresAt],
          )
        } else {
          await pool.query(
            'DELETE FROM end_user_authorization_rate_limits WHERE key = $1',
            [current.key],
          )
        }
      }
    }
    if (fixture) {
      await pool.query(
        'DELETE FROM approval_requests WHERE workspace_id = $1',
        [fixture.workspaceId],
      )
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        fixture.workspaceId,
      ])
    }
    await pool.end()
    delete process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY
    delete process.env.CONNECTION_CREDENTIAL_KEYS
    delete process.env.GOOGLE_CONNECTOR_API_BASE_URL
    delete process.env.GITHUB_API_BASE_URL
    delete process.env.CONNECTION_OAUTH_CALLBACK_BASE_URL
  })

  async function authorize(provider: 'google' | 'github'): Promise<string> {
    const path = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(path)
      .set(await sessionHeaders(baseUrl, fixture.primary, 'POST', path))
      .send({
        provider,
        returnUri: 'http://127.0.0.1:4173/connections/callback',
      })
      .expect(201)
    const authorization = connectionAuthorizationResponseSchema.parse(
      started.body,
    )
    const providerResponse = await fetch(authorization.authorizationUrl, {
      redirect: 'manual',
    })
    const callback = providerResponse.headers.get('location')
    if (!callback) throw new Error(`${provider} omitted its callback`)
    const completed = await fetch(callback, { redirect: 'manual' })
    const returnLocation = completed.headers.get('location')
    if (!returnLocation)
      throw new Error(`${provider} omitted its return location`)
    expect(new URL(returnLocation).searchParams.get('status')).toBe('connected')
    const listed = await request(baseUrl)
      .get('/v1/user/connections')
      .set(
        await sessionHeaders(
          baseUrl,
          fixture.primary,
          'GET',
          '/v1/user/connections',
        ),
      )
      .expect(200)
    const connection = connectionsResponseSchema
      .parse(listed.body)
      .data.find((item) => item.provider === provider)
    if (!connection) throw new Error(`${provider} Connection was not listed`)
    return connection.id
  }

  async function startExecution(
    session: LaunchSession,
    workflowId: string,
    connectionId: string,
    input: Record<string, unknown>,
  ) {
    const path = '/v1/user/executions'
    const response = await request(baseUrl)
      .post(path)
      .set(await sessionHeaders(baseUrl, session, 'POST', path))
      .set('Idempotency-Key', randomUUID())
      .send({ workflowId, input: { connectionId, input } })
      .expect(202)
    return publicExecutionSchema.parse(response.body)
  }

  async function waitForExecution(
    session: LaunchSession,
    executionId: string,
    expectedStatus: 'paused' | 'succeeded' | 'failed',
  ): Promise<void> {
    const path = `/v1/user/executions/${executionId}`
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const response = await request(baseUrl)
        .get(path)
        .set(await sessionHeaders(baseUrl, session, 'GET', path))
        .expect(200)
      const execution = publicExecutionSchema.parse(response.body)
      if (execution.status === expectedStatus) return
      if (execution.status === 'failed' || execution.status === 'cancelled') {
        throw new Error(
          `Execution reached ${execution.status}: ${workerFailure([backgroundWorker!, executionWorker!])}`,
        )
      }
      if (
        backgroundWorker?.process.exitCode !== null ||
        executionWorker?.process.exitCode !== null
      ) {
        throw new Error(
          `Worker exited: ${workerFailure([backgroundWorker!, executionWorker!])}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(
      `Execution did not reach ${expectedStatus}: ${workerFailure([backgroundWorker!, executionWorker!])}`,
    )
  }

  async function expectPublishedOutbox(executionId: string): Promise<void> {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const messages = await pool.query<{ kind: string; status: string }>(
        "SELECT kind, status FROM outbox_messages WHERE workspace_id = $1 AND payload->>'executionId' = $2 AND (kind = 'workflow_execution' OR event_type = 'action_intent.executed')",
        [fixture.workspaceId, executionId],
      )
      if (
        messages.rows.some(
          (message) =>
            message.kind === 'workflow_execution' &&
            message.status === 'published',
        ) &&
        messages.rows.some(
          (message) =>
            message.kind === 'public_event' && message.status === 'published',
        )
      )
        return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(
      'Transactional execution and public-event outbox did not publish',
    )
  }

  it('connects Google and GitHub over OAuth HTTP and isolates the DPoP subject', async () => {
    googleConnectionId = await authorize('google')
    githubConnectionId = await authorize('github')
    const path = '/v1/user/connections'
    const hidden = await request(baseUrl)
      .get(path)
      .set(await sessionHeaders(baseUrl, fixture.otherSubject, 'GET', path))
      .expect(200)
    expect(connectionsResponseSchema.parse(hidden.body).data).toEqual([])
    const primary = await request(baseUrl)
      .get(path)
      .set(await sessionHeaders(baseUrl, fixture.primary, 'GET', path))
      .expect(200)
    expect(JSON.stringify(primary.body)).not.toMatch(/google-access-|gho_/)
  })

  it('runs the queued Google read and consent-bound GitHub write through the public API', async () => {
    backgroundWorker = startWorker('background-worker')
    executionWorker = startWorker('execution-worker')
    const googleExecution = await startExecution(
      fixture.primary,
      fixture.googleWorkflowId,
      googleConnectionId,
      { maxResults: 1 },
    )
    await waitForExecution(fixture.primary, googleExecution.id, 'succeeded')
    expect(
      apiProvider.requests.filter(
        (item) => item.path === '/gmail/v1/users/me/messages',
      ),
    ).toHaveLength(1)
    const githubExecution = await startExecution(
      fixture.primary,
      fixture.githubWorkflowId,
      githubConnectionId,
      {
        owner: 'octo',
        repository: 'demo',
        title: 'Launch gate issue',
        body: 'Approved exact content',
        labels: [],
        assignees: [],
      },
    )
    await waitForExecution(fixture.primary, githubExecution.id, 'paused')
    const pendingPath = '/v1/user/action-intents'
    const pending = await request(baseUrl)
      .get(pendingPath)
      .set(await sessionHeaders(baseUrl, fixture.primary, 'GET', pendingPath))
      .expect(200)
    const [intent] = paginatedResponseSchema(pendingActionIntentSchema)
      .parse(pending.body)
      .data.filter((item) => item.executionId === githubExecution.id)
    if (!intent) throw new Error('Pending GitHub Action Intent was not listed')
    expect(JSON.stringify(intent)).not.toMatch(/gho_|rawProviderSecret/)
    expect(
      apiProvider.requests.filter((item) => item.method === 'POST'),
    ).toHaveLength(0)
    const hidden = await request(baseUrl)
      .get(pendingPath)
      .set(
        await sessionHeaders(baseUrl, fixture.otherSubject, 'GET', pendingPath),
      )
      .expect(200)
    expect(
      paginatedResponseSchema(pendingActionIntentSchema).parse(hidden.body)
        .data,
    ).toEqual([])
    const decisionPath = `/v1/user/approval-requests/${intent.approvalRequest.id}/decisions`
    const decision = await request(baseUrl)
      .post(decisionPath)
      .set(
        await sessionHeaders(
          baseUrl,
          fixture.secondDevice,
          'POST',
          decisionPath,
        ),
      )
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approved' })
      .expect(201)
    expect(approvalDecisionSchema.parse(decision.body).outcome).toBe('approved')
    await waitForExecution(fixture.primary, githubExecution.id, 'succeeded')
    expect(
      apiProvider.requests.filter((item) => item.method === 'POST'),
    ).toHaveLength(1)
    await expectPublishedOutbox(githubExecution.id)
    const executionPath = `/v1/user/executions/${githubExecution.id}`
    const result = await request(baseUrl)
      .get(executionPath)
      .set(await sessionHeaders(baseUrl, fixture.primary, 'GET', executionPath))
      .expect(200)
    expect(JSON.stringify(result.body)).not.toMatch(/gho_|rawProviderSecret/)
  })

  it('projects recent use and audit by audience without provider credentials', async () => {
    const usesPath = `/v1/user/connections/${githubConnectionId}/uses`
    const uses = await request(baseUrl)
      .get(usesPath)
      .set(await sessionHeaders(baseUrl, fixture.primary, 'GET', usesPath))
      .expect(200)
    expect(
      paginatedResponseSchema(connectionUseSchema).parse(uses.body).data.length,
    ).toBeGreaterThan(0)
    expect(JSON.stringify(uses.body)).not.toMatch(/gho_|rawProviderSecret/)
    const hidden = await request(baseUrl)
      .get(usesPath)
      .set(await sessionHeaders(baseUrl, fixture.otherSubject, 'GET', usesPath))
    expect(hidden.status).toBe(404)
    const userPath = '/v1/user/audit-events'
    const userAudit = await request(baseUrl)
      .get(userPath)
      .set(await sessionHeaders(baseUrl, fixture.primary, 'GET', userPath))
      .expect(200)
    const otherAudit = await request(baseUrl)
      .get(userPath)
      .set(await sessionHeaders(baseUrl, fixture.otherSubject, 'GET', userPath))
      .expect(200)
    expect(
      paginatedResponseSchema(endUserConnectorAuditEventSchema).parse(
        userAudit.body,
      ).data.length,
    ).toBeGreaterThan(0)
    expect(
      paginatedResponseSchema(endUserConnectorAuditEventSchema).parse(
        otherAudit.body,
      ).data,
    ).toEqual([])
    const operatorPath = `/v1/applications/${fixture.applicationId}/audit-events`
    const operatorAudit = await request(baseUrl)
      .get(operatorPath)
      .set('Authorization', `Bearer ${fixture.applicationKey}`)
      .expect(200)
    expect(
      paginatedResponseSchema(operatorConnectorAuditEventSchema).parse(
        operatorAudit.body,
      ).data.length,
    ).toBeGreaterThan(0)
    for (const response of [userAudit, operatorAudit]) {
      expect(JSON.stringify(response.body)).not.toMatch(
        /google-access-|gho_|rawProviderSecret/,
      )
    }
  })

  it('revokes the GitHub Connection before another queued side effect can run', async () => {
    const path = `/v1/user/connections/${githubConnectionId}`
    const revoked = await request(baseUrl)
      .delete(path)
      .set(await sessionHeaders(baseUrl, fixture.primary, 'DELETE', path))
      .expect(200)
    expect(connectionSchema.parse(revoked.body).status).toBe('revoked')
    const execution = await startExecution(
      fixture.primary,
      fixture.githubWorkflowId,
      githubConnectionId,
      {
        owner: 'octo',
        repository: 'demo',
        title: 'Blocked after revocation',
        body: 'Must never reach GitHub',
        labels: [],
        assignees: [],
      },
    )
    await waitForExecution(fixture.primary, execution.id, 'failed')
    expect(
      apiProvider.requests.filter((item) => item.method === 'POST'),
    ).toHaveLength(1)
  })
})
