import '@linea/config/env'
import { createHash, randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  db,
  pool,
  repositories,
  applications,
  conversations,
  endUserSessions,
  executions,
  externalSubjectApplications,
  externalSubjects,
  organizations,
} from '@linea/db'
import { publicErrorResponseSchema } from '@linea/protocol/errors'
import {
  approvalDecisionSchema,
  approvalRequestSchema,
} from '@linea/protocol/resources'
import { paginatedResponseSchema } from '@linea/protocol/shared'
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose-v5'
import request from 'supertest'
import type { App } from 'supertest/types'
import { EndUserSessionGuard } from '../end-user-sessions/end-user-session.guard'
import { EndUserRuntimeController } from './end-user-runtime.controller'
import { PublicRuntimeService } from './public-runtime.service'

type ProofKey = { privateKey: KeyLike; publicJwk: JWK }
type SessionFixture = {
  id: string
  token: string
  nonce: string
  key: ProofKey
}
type SubjectFixture = {
  id: string
  conversationId: string
  sessions: SessionFixture[]
}
type BaseFixture = {
  workspaceId: string
  workflowId: string
  workflowVersionId: string
  applicationId: string
}
type Fixture = BaseFixture & {
  subjects: SubjectFixture[]
  crossApplicationSubject: SubjectFixture
}

function hexHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function accessTokenHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

async function createProofKey(): Promise<ProofKey> {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  return { privateKey, publicJwk: await exportJWK(publicKey) }
}

async function createSession(input: {
  fixture: BaseFixture
  externalSubjectId: string
  expiresAt?: Date
}): Promise<SessionFixture> {
  const token = `lnu_${randomUUID().replaceAll('-', '')}`
  const nonce = `nonce_${randomUUID().replaceAll('-', '')}`
  const key = await createProofKey()
  const [session] = await db
    .insert(endUserSessions)
    .values({
      workspaceId: input.fixture.workspaceId,
      applicationId: input.fixture.applicationId,
      externalSubjectId: input.externalSubjectId,
      tokenHash: hexHash(token),
      proofJkt: await calculateJwkThumbprint(key.publicJwk, 'sha256'),
      nonceHash: hexHash(nonce),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000),
    })
    .returning()
  return { id: session.id, token, nonce, key }
}

async function createSubject(fixture: BaseFixture): Promise<SubjectFixture> {
  const [subject] = await db
    .insert(externalSubjects)
    .values({
      workspaceId: fixture.workspaceId,
      issuer: 'https://identity.example.com',
      issuerSubject: randomUUID(),
      status: 'verified',
      verifiedAt: new Date(),
    })
    .returning()
  await db.insert(externalSubjectApplications).values({
    workspaceId: fixture.workspaceId,
    applicationId: fixture.applicationId,
    externalSubjectId: subject.id,
  })
  const [conversation] = await db
    .insert(conversations)
    .values({
      workspaceId: fixture.workspaceId,
      applicationId: fixture.applicationId,
      workflowId: fixture.workflowId,
      externalSubjectId: subject.id,
      environment: 'production',
    })
    .returning()
  return {
    id: subject.id,
    conversationId: conversation.id,
    sessions: [
      await createSession({ fixture, externalSubjectId: subject.id }),
      await createSession({ fixture, externalSubjectId: subject.id }),
    ],
  }
}

async function createFixture(): Promise<Fixture> {
  const [organization] = await db
    .insert(organizations)
    .values({
      name: 'Approval API test',
      slug: `approval-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: 'Approval API workflow',
    slug: `approval-${randomUUID()}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: randomUUID(),
  })
  const [application] = await db
    .insert(applications)
    .values({
      workspaceId: organization.id,
      environment: 'production',
      displayName: 'Customer portal',
      allowedBrowserOrigins: ['https://app.example.com'],
      allowedRedirectOrigins: ['https://app.example.com'],
      oidcIssuer: 'https://identity.example.com',
      oidcClientId: 'portal',
      oidcAudience: 'linea',
      oidcJwksUrl: 'https://identity.example.com/jwks.json',
    })
    .returning()
  const base = {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    applicationId: application.id,
  }
  const [otherApplication] = await db
    .insert(applications)
    .values({
      workspaceId: organization.id,
      environment: 'production',
      displayName: 'Other customer portal',
      allowedBrowserOrigins: ['https://other.example.com'],
      allowedRedirectOrigins: ['https://other.example.com'],
      oidcIssuer: 'https://identity.example.com',
      oidcClientId: 'other-portal',
      oidcAudience: 'linea',
      oidcJwksUrl: 'https://identity.example.com/jwks.json',
    })
    .returning()
  const otherBase = { ...base, applicationId: otherApplication.id }
  return {
    ...base,
    subjects: [await createSubject(base), await createSubject(base)],
    crossApplicationSubject: await createSubject(otherBase),
  }
}

async function createApprovalRequest(
  fixture: Fixture,
  subject: SubjectFixture,
  input: { expiresAt?: Date; requestedAt?: Date } = {},
) {
  const [execution] = await db
    .insert(executions)
    .values({
      workspaceId: fixture.workspaceId,
      workflowId: fixture.workflowId,
      workflowVersionId: fixture.workflowVersionId,
      applicationId: fixture.applicationId,
      externalSubjectRecordId: subject.id,
      conversationId: subject.conversationId,
      trigger: 'api',
      environment: 'production',
      status: 'paused',
    })
    .returning()
  const approvalRequest =
    await repositories.approvalRequest.createApprovalRequest(db, {
      workspaceId: fixture.workspaceId,
      applicationId: fixture.applicationId,
      workflowId: fixture.workflowId,
      executionId: execution.id,
      nodeId: `approval-${randomUUID()}`,
      audience: 'external_subject',
      externalSubjectId: subject.id,
      conversationId: subject.conversationId,
      display: {
        title: 'Send refund?',
        description: 'Refund $49.00',
        details: { amount: '$49.00' },
      },
      expiresAt: input.expiresAt,
      requestedAt: input.requestedAt,
      timeoutAction: input.expiresAt ? 'auto_reject' : undefined,
      actionIntentDigest: input.expiresAt ? 'refund-49' : undefined,
    })
  if (!approvalRequest) throw new Error('Approval Request was not created')
  return approvalRequest
}

async function dpopProof(input: {
  session: SessionFixture
  key?: ProofKey
  method: string
  url: string
}): Promise<string> {
  const key = input.key ?? input.session.key
  return new SignJWT({
    jti: randomUUID(),
    htm: input.method,
    htu: input.url,
    iat: Math.floor(Date.now() / 1000),
    nonce: input.session.nonce,
    ath: accessTokenHash(input.session.token),
  })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk })
    .sign(key.privateKey)
}

describe('end-user Approval Request API', () => {
  let app: INestApplication<App>
  let baseUrl: string
  let fixture: Fixture

  beforeAll(async () => {
    fixture = await createFixture()
    const moduleRef = await Test.createTestingModule({
      controllers: [EndUserRuntimeController],
      providers: [PublicRuntimeService, EndUserSessionGuard],
    }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('v1')
    await app.listen(0)
    baseUrl = await app.getUrl()
  })

  afterAll(async () => {
    await pool.query('DELETE FROM approval_requests WHERE workspace_id = $1', [
      fixture.workspaceId,
    ])
    await pool.query('DELETE FROM organizations WHERE id = $1', [
      fixture.workspaceId,
    ])
    await app.close()
    await pool.end()
  })

  async function headers(
    session: SessionFixture,
    method: string,
    path: string,
    key?: ProofKey,
  ) {
    return {
      Authorization: `DPoP ${session.token}`,
      DPoP: await dpopProof({
        session,
        key,
        method,
        url: `${baseUrl}${path}`,
      }),
    }
  }

  it('polls only pending subject-owned requests with a safe projection', async () => {
    const own = await createApprovalRequest(fixture, fixture.subjects[0])
    await createApprovalRequest(fixture, fixture.subjects[1])
    const path = `/v1/user/approval-requests?conversationId=${fixture.subjects[0].conversationId}`
    const response = await request(baseUrl)
      .get(path)
      .set(await headers(fixture.subjects[0].sessions[0], 'GET', path))
    expect(response.status).toBe(200)
    const body = paginatedResponseSchema(approvalRequestSchema).parse(
      response.body,
    )
    expect(body).toEqual({
      data: [
        {
          id: own.id,
          executionId: own.executionId,
          conversationId: fixture.subjects[0].conversationId,
          status: 'pending',
          version: 1,
          display: own.display,
          requestedAt: own.requestedAt.toISOString(),
          expiresAt: null,
          cancelledAt: null,
          decision: null,
        },
      ],
      nextCursor: null,
    })
    expect(body.data[0]).not.toHaveProperty('actionIntentDigest')
    expect(body.data[0]).not.toHaveProperty('externalSubjectId')
  })

  it('accepts a Decision from a second current session and replays it', async () => {
    const approvalRequest = await createApprovalRequest(
      fixture,
      fixture.subjects[0],
    )
    const path = `/v1/user/approval-requests/${approvalRequest.id}/decisions`
    const decision = { decision: 'approved', comment: 'Reviewed' }
    const first = await request(baseUrl)
      .post(path)
      .set(await headers(fixture.subjects[0].sessions[1], 'POST', path))
      .set('Idempotency-Key', 'approval-decision-0001')
      .send(decision)
    const replay = await request(baseUrl)
      .post(path)
      .set(await headers(fixture.subjects[0].sessions[0], 'POST', path))
      .set('Idempotency-Key', 'approval-decision-0001')
      .send(decision)
    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    const firstBody = approvalDecisionSchema.parse(first.body)
    const replayBody = approvalDecisionSchema.parse(replay.body)
    expect(replayBody).toEqual(firstBody)
    expect(firstBody).toMatchObject({
      outcome: 'approved',
      reason: 'human',
      comment: 'Reviewed',
    })
  })

  it('hides cross-subject requests and rejects a copied token', async () => {
    const approvalRequest = await createApprovalRequest(
      fixture,
      fixture.subjects[0],
    )
    const path = `/v1/user/approval-requests/${approvalRequest.id}`
    const hidden = await request(baseUrl)
      .get(path)
      .set(await headers(fixture.subjects[1].sessions[0], 'GET', path))
    const crossApplication = await request(baseUrl)
      .get(path)
      .set(
        await headers(fixture.crossApplicationSubject.sessions[0], 'GET', path),
      )
    const attackerKey = await createProofKey()
    const copied = await request(baseUrl)
      .get(path)
      .set(
        await headers(
          fixture.subjects[0].sessions[0],
          'GET',
          path,
          attackerKey,
        ),
      )
    expect(hidden.status).toBe(404)
    expect(publicErrorResponseSchema.parse(hidden.body).error.code).toBe(
      'approval_request_wrong_subject',
    )
    expect(crossApplication.status).toBe(404)
    expect(
      publicErrorResponseSchema.parse(crossApplication.body).error.code,
    ).toBe('approval_request_wrong_subject')
    expect(copied.status).toBe(401)
    expect(publicErrorResponseSchema.parse(copied.body).error.code).toBe(
      'proof_invalid',
    )
  })

  it('rejects expired sessions before reading requests', async () => {
    const expired = await createSession({
      fixture,
      externalSubjectId: fixture.subjects[0].id,
      expiresAt: new Date(Date.now() - 1_000),
    })
    const approvalRequest = await createApprovalRequest(
      fixture,
      fixture.subjects[0],
    )
    const path = `/v1/user/approval-requests/${approvalRequest.id}`
    const response = await request(baseUrl)
      .get(path)
      .set(await headers(expired, 'GET', path))
    expect(response.status).toBe(401)
    expect(publicErrorResponseSchema.parse(response.body).error.code).toBe(
      'session_expired',
    )
  })

  it('replays a committed Decision without duplicating dispatch or public events', async () => {
    const subject = fixture.subjects[0]
    const approvalRequest = await createApprovalRequest(fixture, subject)
    const path = `/v1/user/approval-requests/${approvalRequest.id}/decisions`
    const unavailable = await request(baseUrl)
      .post(path)
      .set(await headers(subject.sessions[0], 'POST', path))
      .set('Idempotency-Key', 'approval-retry-0001')
      .send({ decision: 'approved' })
    const retried = await request(baseUrl)
      .post(path)
      .set(await headers(subject.sessions[1], 'POST', path))
      .set('Idempotency-Key', 'approval-retry-0001')
      .send({ decision: 'approved' })
    expect(unavailable.status).toBe(201)
    expect(approvalDecisionSchema.parse(unavailable.body).outcome).toBe(
      'approved',
    )
    expect(retried.status).toBe(201)
    expect(approvalDecisionSchema.parse(retried.body).outcome).toBe('approved')
    const workflowMessages = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM outbox_messages WHERE kind = 'workflow_execution' AND payload->>'executionId' = $1",
      [approvalRequest.executionId],
    )
    expect(workflowMessages.rows[0].count).toBe(1)
    const publicEvents = await pool.query<{
      event_type: string
      external_subject_id: string
      count: number
    }>(
      "SELECT event_type, external_subject_id, count(*)::int AS count FROM outbox_messages WHERE application_id = $1 AND payload->>'approvalRequestId' = $2 GROUP BY event_type, external_subject_id",
      [fixture.applicationId, approvalRequest.id],
    )
    expect(publicEvents.rows).toEqual(
      expect.arrayContaining([
        {
          event_type: 'approval_request.created',
          external_subject_id: subject.id,
          count: 1,
        },
        {
          event_type: 'approval_request.decided',
          external_subject_id: subject.id,
          count: 1,
        },
      ]),
    )
  })

  it('returns stable errors for cancelled, expired, and conflicting Decisions', async () => {
    const subject = fixture.subjects[0]
    const cancelled = await createApprovalRequest(fixture, subject)
    await pool.query(
      "UPDATE approval_requests SET status = 'cancelled', cancelled_at = now() WHERE id = $1",
      [cancelled.id],
    )
    const cancelledPath = `/v1/user/approval-requests/${cancelled.id}/decisions`
    const cancelledResponse = await request(baseUrl)
      .post(cancelledPath)
      .set(await headers(subject.sessions[0], 'POST', cancelledPath))
      .set('Idempotency-Key', 'approval-cancelled-0001')
      .send({ decision: 'rejected' })
    const requestedAt = new Date(Date.now() - 60_000)
    const expired = await createApprovalRequest(fixture, subject, {
      requestedAt,
      expiresAt: new Date(requestedAt.getTime() + 1_000),
    })
    const expiredPath = `/v1/user/approval-requests/${expired.id}/decisions`
    const expiredResponse = await request(baseUrl)
      .post(expiredPath)
      .set(await headers(subject.sessions[0], 'POST', expiredPath))
      .set('Idempotency-Key', 'approval-expired-0001')
      .send({ decision: 'approved' })
    const decided = await createApprovalRequest(fixture, subject)
    const decidedPath = `/v1/user/approval-requests/${decided.id}/decisions`
    await request(baseUrl)
      .post(decidedPath)
      .set(await headers(subject.sessions[0], 'POST', decidedPath))
      .set('Idempotency-Key', 'approval-decided-0001')
      .send({ decision: 'approved' })
      .expect(201)
    const alreadyDecided = await request(baseUrl)
      .post(decidedPath)
      .set(await headers(subject.sessions[0], 'POST', decidedPath))
      .set('Idempotency-Key', 'approval-decided-0002')
      .send({ decision: 'approved' })
    const conflict = await request(baseUrl)
      .post(decidedPath)
      .set(await headers(subject.sessions[1], 'POST', decidedPath))
      .set('Idempotency-Key', 'approval-decided-0001')
      .send({ decision: 'rejected' })
    expect(
      publicErrorResponseSchema.parse(cancelledResponse.body).error.code,
    ).toBe('approval_request_cancelled')
    expect(
      publicErrorResponseSchema.parse(expiredResponse.body).error.code,
    ).toBe('approval_request_expired')
    expect(
      publicErrorResponseSchema.parse(alreadyDecided.body).error.code,
    ).toBe('approval_request_already_decided')
    expect(publicErrorResponseSchema.parse(conflict.body).error.code).toBe(
      'decision_conflict',
    )
  })
})
