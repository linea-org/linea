import '@linea/config/env'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import { publicErrorResponseSchema } from '@linea/protocol/errors'
import {
  approvalDecisionSchema,
  conversationSchema,
  endUserAuthorizationResponseSchema,
  endUserIdentityExchangeSchema,
  endUserSessionCredentialSchema,
  messageSchema,
  publicExecutionSchema,
} from '@linea/protocol/resources'
import { paginatedResponseSchema } from '@linea/protocol/shared'
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose-v5'
import request from 'supertest'
import type { App } from 'supertest/types'
import { generateApplicationKey } from '../auth/api-key.util'
import { EndUserAuthorizationModule } from '../end-user-authorization/end-user-authorization.module'
import { PublicRuntimeModule } from '../public-runtime/public-runtime.module'
import { startTestIdentityProvider } from './test-identity-provider'

type ProofKey = { privateKey: KeyLike; publicJwk: JWK }
type LaunchSession = {
  externalSubjectId: string
  accessToken: string
  dpopNonce: string
  key: ProofKey
}
type LaunchFixture = {
  workspaceId: string
  applicationId: string
  workflowId: string
  contractRevisionId: string
  applicationKey: string
}
type RateLimitSnapshot = {
  key: string
  requestCount: number
  expiresAt: Date
}

function challenge(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

async function proofKey(): Promise<ProofKey> {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  return { privateKey, publicJwk: await exportJWK(publicKey) }
}

async function dpopProof(input: {
  key: ProofKey
  method: string
  url: string
  nonce: string
  accessToken?: string
  jti?: string
}): Promise<string> {
  return new SignJWT({
    jti: input.jti ?? randomUUID(),
    htm: input.method,
    htu: input.url,
    iat: Math.floor(Date.now() / 1000),
    nonce: input.nonce,
    ...(input.accessToken ? { ath: tokenHash(input.accessToken) } : {}),
  })
    .setProtectedHeader({
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: input.key.publicJwk,
    })
    .sign(input.key.privateKey)
}

describe('first-launch approval protocol', () => {
  let app: INestApplication<App>
  let baseUrl: string
  let identityProvider: Awaited<ReturnType<typeof startTestIdentityProvider>>
  let fixture: LaunchFixture
  let primary: LaunchSession
  let secondDevice: LaunchSession
  let otherSubject: LaunchSession
  let rateLimitBaseline: Map<string, RateLimitSnapshot>

  beforeAll(async () => {
    identityProvider = await startTestIdentityProvider()
    fixture = await createFixture(identityProvider)
    const rateLimits = await pool.query<RateLimitSnapshot>(
      'SELECT key, request_count AS "requestCount", expires_at AS "expiresAt" FROM end_user_authorization_rate_limits',
    )
    rateLimitBaseline = new Map(rateLimits.rows.map((row) => [row.key, row]))
    const moduleRef = await Test.createTestingModule({
      imports: [EndUserAuthorizationModule, PublicRuntimeModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('v1')
    await app.listen(0)
    baseUrl = await app.getUrl()
    primary = await authorize('customer-1')
    secondDevice = await authorize('customer-1')
    otherSubject = await authorize('customer-2')
  })

  afterAll(async () => {
    await app.close()
    await identityProvider.close()
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
    await pool.query('DELETE FROM approval_requests WHERE workspace_id = $1', [
      fixture.workspaceId,
    ])
    await pool.query('DELETE FROM organizations WHERE id = $1', [
      fixture.workspaceId,
    ])
    await pool.end()
  })

  async function authorize(subject: string): Promise<LaunchSession> {
    identityProvider.setSubject(subject)
    const redirectUri = 'http://127.0.0.1:4173/callback'
    const verifier = randomBytes(32).toString('base64url')
    const started = await request(baseUrl)
      .post('/v1/user-sessions/authorization')
      .send({
        applicationId: fixture.applicationId,
        redirectUri,
        codeChallenge: challenge(verifier),
      })
      .expect(201)
    const authorization = endUserAuthorizationResponseSchema.parse(started.body)
    const authorized = await fetch(authorization.authorizationUrl, {
      redirect: 'manual',
    })
    expect(authorized.status).toBe(302)
    const location = authorized.headers.get('location')
    if (!location)
      throw new Error('Test identity provider omitted its redirect')
    const callback = new URL(location)
    const code = callback.searchParams.get('code')
    const state = callback.searchParams.get('state')
    if (!code || !state) throw new Error('OIDC callback omitted code or state')
    const exchanged = await request(baseUrl)
      .post('/v1/user-sessions/exchange')
      .send({
        applicationId: fixture.applicationId,
        redirectUri,
        code,
        state,
        codeVerifier: verifier,
      })
      .expect(201)
    const identity = endUserIdentityExchangeSchema.parse(exchanged.body)
    const key = await proofKey()
    const path = '/v1/user-sessions'
    const sessionResponse = await request(baseUrl)
      .post(path)
      .set(
        'DPoP',
        await dpopProof({
          key,
          method: 'POST',
          url: `${baseUrl}${path}`,
          nonce: identity.dpopNonce,
        }),
      )
      .send({ exchangeToken: identity.exchangeToken })
      .expect(201)
    const session = endUserSessionCredentialSchema.parse(sessionResponse.body)
    return {
      externalSubjectId: identity.externalSubjectId,
      accessToken: session.accessToken,
      dpopNonce: session.dpopNonce,
      key,
    }
  }

  async function sessionHeaders(
    session: LaunchSession,
    method: string,
    path: string,
    input: { key?: ProofKey; jti?: string } = {},
  ) {
    return {
      Authorization: `DPoP ${session.accessToken}`,
      DPoP: await dpopProof({
        key: input.key ?? session.key,
        method,
        url: `${baseUrl}${path}`,
        nonce: session.dpopNonce,
        accessToken: session.accessToken,
        jti: input.jti,
      }),
    }
  }

  async function createConversation(title: string) {
    const path = '/v1/user/conversations'
    const response = await request(baseUrl)
      .post(path)
      .set(await sessionHeaders(primary, 'POST', path))
      .set('Idempotency-Key', `conversation-${randomUUID()}`)
      .send({ workflowId: fixture.workflowId, title, metadata: {} })
      .expect(201)
    return conversationSchema.parse(response.body)
  }

  async function startExecution(
    session: LaunchSession,
    conversationId?: string,
  ) {
    const path = '/v1/user/executions'
    const response = await request(baseUrl)
      .post(path)
      .set(await sessionHeaders(session, 'POST', path))
      .set('Idempotency-Key', `execution-${randomUUID()}`)
      .send({
        workflowId: fixture.workflowId,
        conversationId,
        input: { prompt: 'launch' },
      })
      .expect(202)
    return publicExecutionSchema.parse(response.body)
  }

  async function createApproval(session: LaunchSession, expiresAt?: Date) {
    const execution = await startExecution(session)
    await pool.query("UPDATE executions SET status = 'paused' WHERE id = $1", [
      execution.id,
    ])
    const approval = await repositories.approvalRequest.createApprovalRequest(
      db,
      {
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        workflowId: fixture.workflowId,
        executionId: execution.id,
        nodeId: `approval-${randomUUID()}`,
        audience: 'external_subject',
        externalSubjectId: session.externalSubjectId,
        display: { title: 'Release launch?' },
        expiresAt,
        timeoutAction: expiresAt ? 'auto_reject' : undefined,
      },
    )
    if (!approval) throw new Error('Launch Approval Request was not created')
    return approval
  }

  it('runs real OIDC PKCE and rejects copied tokens and proof replay', async () => {
    expect(primary.externalSubjectId).toBe(secondDevice.externalSubjectId)
    expect(otherSubject.externalSubjectId).not.toBe(primary.externalSubjectId)
    const path = '/v1/user/conversations'
    const attackerKey = await proofKey()
    const copied = await request(baseUrl)
      .get(path)
      .set(await sessionHeaders(primary, 'GET', path, { key: attackerKey }))
    expect(copied.status).toBe(401)
    expect(publicErrorResponseSchema.parse(copied.body).error.code).toBe(
      'proof_invalid',
    )
    const replayHeaders = await sessionHeaders(primary, 'GET', path, {
      jti: randomUUID(),
    })
    await request(baseUrl).get(path).set(replayHeaders).expect(200)
    const replayed = await request(baseUrl).get(path).set(replayHeaders)
    expect(replayed.status).toBe(401)
    expect(publicErrorResponseSchema.parse(replayed.body).error.code).toBe(
      'proof_invalid',
    )
  })

  it('keeps same-subject Conversations isolated and starts both contract-bound execution paths', async () => {
    const first = await createConversation('First thread')
    const second = await createConversation('Second thread')
    for (const [conversation, content] of [
      [first, 'first only'],
      [second, 'second only'],
    ] as const) {
      const path = `/v1/user/conversations/${conversation.id}/messages`
      await request(baseUrl)
        .post(path)
        .set(await sessionHeaders(primary, 'POST', path))
        .set('Idempotency-Key', `message-${randomUUID()}`)
        .send({ content })
        .expect(201)
    }
    const firstPath = `/v1/user/conversations/${first.id}/messages`
    const secondPath = `/v1/user/conversations/${second.id}/messages`
    const firstMessages = await request(baseUrl)
      .get(firstPath)
      .set(await sessionHeaders(primary, 'GET', firstPath))
      .expect(200)
    const secondMessages = await request(baseUrl)
      .get(secondPath)
      .set(await sessionHeaders(primary, 'GET', secondPath))
      .expect(200)
    expect(
      paginatedResponseSchema(messageSchema)
        .parse(firstMessages.body)
        .data.map((item) => item.content),
    ).toEqual(['first only'])
    expect(
      paginatedResponseSchema(messageSchema)
        .parse(secondMessages.body)
        .data.map((item) => item.content),
    ).toEqual(['second only'])
    const backendPath = `/v1/applications/${fixture.applicationId}/executions`
    const backend = await request(baseUrl)
      .post(backendPath)
      .set('Authorization', `Bearer ${fixture.applicationKey}`)
      .set('Idempotency-Key', `backend-${randomUUID()}`)
      .send({
        workflowId: fixture.workflowId,
        externalSubjectId: primary.externalSubjectId,
        conversationId: first.id,
        input: { prompt: 'backend' },
      })
      .expect(202)
    const backendExecution = publicExecutionSchema.parse(backend.body)
    const endUser = await startExecution(primary, second.id)
    expect(backendExecution).toMatchObject({
      conversationId: first.id,
      externalSubjectId: primary.externalSubjectId,
    })
    expect(endUser).toMatchObject({
      conversationId: second.id,
      externalSubjectId: primary.externalSubjectId,
    })
    const rows = await pool.query<{ workflow_contract_revision_id: string }>(
      'SELECT workflow_contract_revision_id FROM executions WHERE id IN ($1, $2)',
      [backendExecution.id, endUser.id],
    )
    expect(rows.rows.map((row) => row.workflow_contract_revision_id)).toEqual([
      fixture.contractRevisionId,
      fixture.contractRevisionId,
    ])
  })

  it('allows a second same-subject session to decide and hides the request cross-subject', async () => {
    const approval = await createApproval(primary)
    const path = `/v1/user/approval-requests/${approval.id}/decisions`
    const hidden = await request(baseUrl)
      .post(path)
      .set(await sessionHeaders(otherSubject, 'POST', path))
      .set('Idempotency-Key', `cross-${randomUUID()}`)
      .send({ decision: 'approved' })
    expect(hidden.status).toBe(404)
    expect(publicErrorResponseSchema.parse(hidden.body).error.code).toBe(
      'approval_request_wrong_subject',
    )
    const decided = await request(baseUrl)
      .post(path)
      .set(await sessionHeaders(secondDevice, 'POST', path))
      .set('Idempotency-Key', `same-${randomUUID()}`)
      .send({ decision: 'approved', comment: 'Second device' })
      .expect(201)
    expect(approvalDecisionSchema.parse(decided.body)).toMatchObject({
      outcome: 'approved',
      reason: 'human',
    })
  })

  it('converges decision races with timeout and cancellation on one Approval terminal state', async () => {
    const timeoutApproval = await createApproval(
      primary,
      new Date(Date.now() + 5_000),
    )
    const timeoutPath = `/v1/user/approval-requests/${timeoutApproval.id}/decisions`
    const [humanResponse] = await Promise.all([
      request(baseUrl)
        .post(timeoutPath)
        .set(await sessionHeaders(primary, 'POST', timeoutPath))
        .set('Idempotency-Key', `timeout-race-${randomUUID()}`)
        .send({ decision: 'approved' }),
      repositories.approvalRequest.claimAndDecideTimedOutApprovalRequest(
        db,
        new Date(Date.now() + 10_000),
      ),
    ])
    expect([201, 409]).toContain(humanResponse.status)
    await expectTerminalApproval(timeoutApproval.id)
    const cancellationApproval = await createApproval(primary)
    const cancellationPath = `/v1/user/approval-requests/${cancellationApproval.id}/decisions`
    const cancelPath = `/v1/executions/${cancellationApproval.executionId}/cancel`
    const [decisionResponse, cancellationResponse] = await Promise.all([
      request(baseUrl)
        .post(cancellationPath)
        .set(await sessionHeaders(primary, 'POST', cancellationPath))
        .set('Idempotency-Key', `cancel-race-decision-${randomUUID()}`)
        .send({ decision: 'rejected' }),
      request(baseUrl)
        .post(cancelPath)
        .set('Authorization', `Bearer ${fixture.applicationKey}`)
        .set('Idempotency-Key', `cancel-race-${randomUUID()}`),
    ])
    expect([201, 409]).toContain(decisionResponse.status)
    expect(cancellationResponse.status).toBe(200)
    await expectTerminalApproval(cancellationApproval.id)
  })

  async function expectTerminalApproval(
    approvalRequestId: string,
  ): Promise<void> {
    const result = await pool.query<{ status: string; decisions: number }>(
      'SELECT ar.status, count(ad.id)::int AS decisions FROM approval_requests ar LEFT JOIN approval_decisions ad ON ad.approval_request_id = ar.id WHERE ar.id = $1 GROUP BY ar.status',
      [approvalRequestId],
    )
    expect(result.rows).toHaveLength(1)
    expect(['decided', 'cancelled']).toContain(result.rows[0]?.status)
    expect(result.rows[0]?.decisions).toBeLessThanOrEqual(1)
  }
})

async function createFixture(
  identityProvider: Awaited<ReturnType<typeof startTestIdentityProvider>>,
): Promise<LaunchFixture> {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'First launch gate',
      slug: `first-launch-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: 'Launch workflow',
    slug: `launch-${suffix}`,
  })
  const contract =
    await repositories.workflowContract.createWorkflowContractRevision(
      db,
      organization.id,
      workflow.id,
      {
        inputSchema: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
          additionalProperties: false,
        },
        outputSchema: { type: 'object' },
      },
    )
  if (contract.outcome !== 'created')
    throw new Error('Launch Workflow Contract was not created')
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: suffix,
    workflowContractRevisionId: contract.revision.id,
  })
  await repositories.workflow.publishWorkflowVersion(
    db,
    workflow.id,
    version.id,
  )
  const [application] = await db
    .insert(schema.applications)
    .values({
      workspaceId: organization.id,
      environment: 'dev',
      displayName: 'Launch application',
      allowedBrowserOrigins: ['http://127.0.0.1:4173'],
      allowedRedirectOrigins: ['http://127.0.0.1:4173'],
      oidcIssuer: identityProvider.issuer,
      oidcClientId: 'launch-client',
      oidcAudience: 'launch-client',
      oidcJwksUrl: identityProvider.jwksUrl,
    })
    .returning()
  const binding =
    await repositories.applicationWorkflowBinding.putApplicationWorkflowBinding(
      db,
      organization.id,
      application.id,
      workflow.id,
      {
        workflowContractRevisionId: contract.revision.id,
        allowBackendStart: true,
        allowEndUserStart: true,
        enabled: true,
      },
    )
  if (binding.outcome !== 'updated')
    throw new Error('Launch Workflow binding was not created')
  const generatedKey = generateApplicationKey()
  await db.insert(schema.applicationKeys).values({
    workspaceId: organization.id,
    applicationId: application.id,
    name: 'Launch suite',
    scopes: [
      'executions:read',
      'executions:start',
      'executions:cancel',
      'conversations:read',
      'conversations:write',
    ],
    hashedKey: generatedKey.hashedKey,
    keyPrefix: generatedKey.keyPrefix,
  })
  return {
    workspaceId: organization.id,
    applicationId: application.id,
    workflowId: workflow.id,
    contractRevisionId: contract.revision.id,
    applicationKey: generatedKey.rawKey,
  }
}
