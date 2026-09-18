import '@linea/config/env'
import { createHash, randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  applications,
  db,
  endUserSessions,
  externalSubjectApplications,
  externalSubjects,
  organizations,
  outboxMessages,
  pool,
  repositories,
} from '@linea/db'
import { publicErrorResponseSchema } from '@linea/protocol/errors'
import { eventEnvelopeSchema, type EventType } from '@linea/protocol/events'
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose-v5'
import type { App } from 'supertest/types'
import { EndUserSessionGuard } from '../end-user-sessions/end-user-session.guard'
import { EndUserEventStreamService } from './end-user-event-stream.service'
import { EndUserRuntimeController } from './end-user-runtime.controller'
import { PublicRuntimeService } from './public-runtime.service'

type ProofKey = { privateKey: KeyLike; publicJwk: JWK }
type SessionFixture = {
  id: string
  token: string
  nonce: string
  key: ProofKey
}
type SubjectFixture = { id: string; session: SessionFixture }
type Fixture = {
  workspaceId: string
  applicationId: string
  subjects: [SubjectFixture, SubjectFixture]
}

function hexHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function accessTokenHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

async function withTimeout<T>(promise: Promise<T>, milliseconds = 5_000) {
  let timeout: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Timed out waiting for event stream')),
      milliseconds,
    )
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeout)
  }
}

async function createProofKey(): Promise<ProofKey> {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  return { privateKey, publicJwk: await exportJWK(publicKey) }
}

async function createSession(
  fixture: Pick<Fixture, 'workspaceId' | 'applicationId'>,
  externalSubjectId: string,
): Promise<SessionFixture> {
  const token = `lnu_${randomUUID().replaceAll('-', '')}`
  const nonce = `nonce_${randomUUID().replaceAll('-', '')}`
  const key = await createProofKey()
  const [session] = await db
    .insert(endUserSessions)
    .values({
      workspaceId: fixture.workspaceId,
      applicationId: fixture.applicationId,
      externalSubjectId,
      tokenHash: hexHash(token),
      proofJkt: await calculateJwkThumbprint(key.publicJwk, 'sha256'),
      nonceHash: hexHash(nonce),
      expiresAt: new Date(Date.now() + 5 * 60_000),
    })
    .returning()
  return { id: session.id, token, nonce, key }
}

async function createFixture(): Promise<Fixture> {
  const [organization] = await db
    .insert(organizations)
    .values({
      name: 'End-user event test',
      slug: `events-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning()
  const [application] = await db
    .insert(applications)
    .values({
      workspaceId: organization.id,
      environment: 'production',
      displayName: 'Event client',
      allowedBrowserOrigins: ['https://app.example.com'],
      allowedRedirectOrigins: ['https://app.example.com'],
      oidcIssuer: 'https://identity.example.com',
      oidcClientId: 'events',
      oidcAudience: 'linea',
      oidcJwksUrl: 'https://identity.example.com/jwks.json',
    })
    .returning()
  const subjects = await db
    .insert(externalSubjects)
    .values([
      {
        workspaceId: organization.id,
        issuer: 'https://identity.example.com',
        issuerSubject: `subject-a-${randomUUID()}`,
        status: 'verified',
        verifiedAt: new Date(),
      },
      {
        workspaceId: organization.id,
        issuer: 'https://identity.example.com',
        issuerSubject: `subject-b-${randomUUID()}`,
        status: 'verified',
        verifiedAt: new Date(),
      },
    ])
    .returning()
  await db.insert(externalSubjectApplications).values(
    subjects.map((subject) => ({
      workspaceId: organization.id,
      applicationId: application.id,
      externalSubjectId: subject.id,
    })),
  )
  const base = {
    workspaceId: organization.id,
    applicationId: application.id,
  }
  const first = subjects[0]
  const second = subjects[1]
  if (!first || !second) throw new Error('Subjects were not created')
  return {
    ...base,
    subjects: [
      { id: first.id, session: await createSession(base, first.id) },
      { id: second.id, session: await createSession(base, second.id) },
    ],
  }
}

async function dpopProof(
  session: SessionFixture,
  method: string,
  url: string,
): Promise<string> {
  return new SignJWT({
    jti: randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
    nonce: session.nonce,
    ath: accessTokenHash(session.token),
  })
    .setProtectedHeader({
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: session.key.publicJwk,
    })
    .sign(session.key.privateKey)
}

async function createEvent(
  fixture: Fixture,
  subject: SubjectFixture,
  eventType: EventType,
  conversationId: string,
) {
  return repositories.outboxMessage.createPublicEvent(db, {
    workspaceId: fixture.workspaceId,
    applicationId: fixture.applicationId,
    externalSubjectId: subject.id,
    eventType,
    data: {
      approvalRequestId: randomUUID(),
      conversationId,
      status: eventType === 'approval_request.created' ? 'pending' : 'decided',
    },
  })
}

describe('end-user event stream', () => {
  let app: INestApplication<App>
  let baseUrl: string
  let fixture: Fixture

  beforeAll(async () => {
    fixture = await createFixture()
    const moduleRef = await Test.createTestingModule({
      controllers: [EndUserRuntimeController],
      providers: [
        PublicRuntimeService,
        EndUserEventStreamService,
        EndUserSessionGuard,
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('v1')
    await app.listen(0)
    baseUrl = await app.getUrl()
  })

  afterAll(async () => {
    await app.close()
    await pool.query('DELETE FROM organizations WHERE id = $1', [
      fixture.workspaceId,
    ])
    await pool.end()
  })

  async function openStream(
    subject: SubjectFixture,
    path: string,
    lastEventId?: string,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `DPoP ${subject.session.token}`,
        DPoP: await dpopProof(subject.session, 'GET', `${baseUrl}${path}`),
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      },
    })
    return response
  }

  async function readEvents(response: Response, count: number) {
    if (!response.body) throw new Error('Event stream body is missing')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const events: ReturnType<typeof eventEnvelopeSchema.parse>[] = []
    let buffer = ''
    try {
      while (events.length < count) {
        const chunk = await withTimeout(reader.read())
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const data = frame
            .split('\n')
            .find((line) => line.startsWith('data: '))
          if (data)
            events.push(eventEnvelopeSchema.parse(JSON.parse(data.slice(6))))
        }
      }
      return events
    } finally {
      await reader.cancel()
    }
  }

  it('streams only safe events for the authenticated subject and filters', async () => {
    const conversationId = randomUUID()
    const own = await createEvent(
      fixture,
      fixture.subjects[0],
      'approval_request.created',
      conversationId,
    )
    await createEvent(
      fixture,
      fixture.subjects[0],
      'approval_request.decided',
      randomUUID(),
    )
    await createEvent(
      fixture,
      fixture.subjects[1],
      'approval_request.created',
      conversationId,
    )
    const path = `/v1/user/events?conversationId=${conversationId}&eventType=approval_request.created`
    const response = await openStream(fixture.subjects[0], path)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const events = await readEvents(response, 1)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      id: own.id,
      type: 'approval_request.created',
      applicationId: fixture.applicationId,
    })
    expect(events[0]?.data).not.toHaveProperty('externalSubjectId')
    expect(events[0]?.data).not.toHaveProperty('input')
    expect(events[0]?.data).not.toHaveProperty('token')
  })

  it('resumes exclusively after the last event without duplicates', async () => {
    const conversationId = randomUUID()
    const first = await createEvent(
      fixture,
      fixture.subjects[0],
      'approval_request.created',
      conversationId,
    )
    const second = await createEvent(
      fixture,
      fixture.subjects[0],
      'approval_request.decided',
      conversationId,
    )
    const path = `/v1/user/events?conversationId=${conversationId}`
    const initial = await openStream(fixture.subjects[0], path)
    const initialEvents = await readEvents(initial, 2)
    expect(initialEvents.map((event) => event.id)).toEqual([
      first.id,
      second.id,
    ])
    const resumed = await openStream(fixture.subjects[0], path, first.id)
    const resumedEvents = await readEvents(resumed, 1)
    expect(resumedEvents.map((event) => event.id)).toEqual([second.id])
  })

  it('drains event lag across multiple database pages', async () => {
    const conversationId = randomUUID()
    const inserted = await db
      .insert(outboxMessages)
      .values(
        Array.from(
          { length: 105 },
          (_, index): typeof outboxMessages.$inferInsert => ({
            workspaceId: fixture.workspaceId,
            applicationId: fixture.applicationId,
            externalSubjectId: fixture.subjects[0].id,
            kind: 'public_event',
            eventType: 'approval_request.created',
            payload: {
              approvalRequestId: randomUUID(),
              conversationId,
              sequence: index,
            },
          }),
        ),
      )
      .returning({ id: outboxMessages.id })
    const path = `/v1/user/events?conversationId=${conversationId}`
    const response = await openStream(fixture.subjects[0], path)
    const events = await readEvents(response, inserted.length)
    expect(events.map((event) => event.id)).toEqual(
      inserted.map((event) => event.id),
    )
  })

  it('rejects expired and cross-subject cursors', async () => {
    const event = await createEvent(
      fixture,
      fixture.subjects[0],
      'approval_request.created',
      randomUUID(),
    )
    const path = '/v1/user/events'
    const crossSubject = await openStream(fixture.subjects[1], path, event.id)
    expect(crossSubject.status).toBe(410)
    expect(
      publicErrorResponseSchema.parse(await crossSubject.json()).error.code,
    ).toBe('event_cursor_expired')
    await pool.query(
      "UPDATE outbox_messages SET created_at = now() - interval '8 days' WHERE id = $1",
      [event.id],
    )
    const expired = await openStream(fixture.subjects[0], path, event.id)
    expect(expired.status).toBe(410)
    expect(
      publicErrorResponseSchema.parse(await expired.json()).error.code,
    ).toBe('event_cursor_expired')
  })

  it('limits each Application subject to three simultaneous streams', async () => {
    const path = `/v1/user/events?conversationId=${randomUUID()}`
    const streams = await Promise.all([
      openStream(fixture.subjects[0], path),
      openStream(fixture.subjects[0], path),
      openStream(fixture.subjects[0], path),
    ])
    try {
      expect(streams.map((stream) => stream.status)).toEqual([200, 200, 200])
      const rejected = await openStream(fixture.subjects[0], path)
      expect(rejected.status).toBe(429)
      expect(
        publicErrorResponseSchema.parse(await rejected.json()).error.code,
      ).toBe('rate_limited')
    } finally {
      for (const stream of streams) {
        if (stream.body) await stream.body.cancel()
      }
    }
  })

  it('stops a full-page backlog after session revocation', async () => {
    const conversationId = randomUUID()
    const inserted = await db
      .insert(outboxMessages)
      .values(
        Array.from(
          { length: 1_000 },
          (): typeof outboxMessages.$inferInsert => ({
            workspaceId: fixture.workspaceId,
            applicationId: fixture.applicationId,
            externalSubjectId: fixture.subjects[1].id,
            kind: 'public_event',
            eventType: 'approval_request.created',
            payload: {
              approvalRequestId: randomUUID(),
              conversationId,
            },
          }),
        ),
      )
      .returning({ id: outboxMessages.id })
    const path = `/v1/user/events?conversationId=${conversationId}`
    const response = await openStream(fixture.subjects[1], path)
    if (!response.body) throw new Error('Event stream body is missing')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventCount = 0
    let revoked = false
    while (true) {
      const chunk = await withTimeout(reader.read())
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      eventCount += frames.filter((frame) => frame.includes('data: ')).length
      if (!revoked && eventCount >= 100) {
        await repositories.endUserSession.revokeEndUserSession(
          db,
          fixture.subjects[1].session.id,
          new Date(),
        )
        revoked = true
      }
    }
    expect(revoked).toBe(true)
    expect(eventCount).toBeLessThan(inserted.length)
  })
})
