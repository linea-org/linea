import '@linea/config/env'
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  verify,
} from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ConnectorGateway, connectorOperationRegistry } from '@linea/connectors'
import { db, decryptCredential, pool, repositories, schema } from '@linea/db'
import { connectionSchema } from '@linea/protocol/resources'
import {
  generateKeyPair,
  exportJWK,
  calculateJwkThumbprint,
  SignJWT,
} from 'jose-v5'
import request from 'supertest'
import { z } from 'zod'
import type { App } from 'supertest/types'
import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from '../auth/workspace-auth.guard'
import { ConnectionsModule } from './connections.module'
import { PublicRuntimeModule } from '../public-runtime/public-runtime.module'
import { generateApiKey } from '../auth/api-key.util'

jest.setTimeout(30000)

function deferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred promise uninitialized')
  }
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function json(response: ServerResponse, body: unknown, status = 200) {
  response
    .writeHead(status, { 'content-type': 'application/json' })
    .end(JSON.stringify(body))
}

describe('shared Environment Connection API and Gateway', () => {
  let app: INestApplication<App>
  let provider: Server
  let baseUrl: string
  let workspaceId: string
  let operatorId: string
  let environmentId: string
  let productionId: string
  let applicationId: string
  let installationId = 42
  let writeCount = 0
  let readCount = 0
  let tokenBarrier:
    | {
        entered: ReturnType<typeof deferred>
        release: ReturnType<typeof deferred>
      }
    | undefined
  const gateway = new ConnectorGateway(db, connectorOperationRegistry)
  const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const privateKey = keyPair.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString()
  const originalEnvironment = {
    github: process.env.GITHUB_API_BASE_URL,
    active: process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY,
    keys: process.env.CONNECTION_CREDENTIAL_KEYS,
  }
  beforeAll(async () => {
    provider = createServer((req, res) => {
      void (async () => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname
        if (path.startsWith('/app/installations/')) {
          const jwt = req.headers.authorization?.replace(/^Bearer /, '') ?? ''
          const [header, claims, signature] = jwt.split('.')
          if (
            !header ||
            !claims ||
            !signature ||
            !verify(
              'RSA-SHA256',
              Buffer.from(`${header}.${claims}`),
              keyPair.publicKey,
              Buffer.from(signature, 'base64url'),
            )
          )
            return json(res, {}, 401)
          const payload = z
            .object({ iss: z.literal('123'), iat: z.number(), exp: z.number() })
            .parse(JSON.parse(Buffer.from(claims, 'base64url').toString()))
          expect(payload.exp - payload.iat).toBeLessThanOrEqual(600)
          if (req.method === 'GET')
            return json(res, {
              id: Number(path.split('/')[3]),
              app_id: 123,
              account: { login: 'Acme' },
              permissions: { metadata: 'read', issues: 'write' },
              suspended_at: null,
            })
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            if (!(chunk instanceof Uint8Array))
              throw new Error('Invalid provider request body')
            chunks.push(Buffer.from(chunk))
          }
          const body = z
            .object({
              permissions: z.record(z.string(), z.enum(['read', 'write'])),
            })
            .parse(JSON.parse(Buffer.concat(chunks).toString()))
          const barrier = tokenBarrier
          if (barrier) {
            tokenBarrier = undefined
            barrier.entered.resolve()
            await barrier.release.promise
          }
          return json(
            res,
            {
              token: 'installation-token',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
              permissions: body.permissions,
            },
            201,
          )
        }
        if (req.headers.authorization !== 'Bearer installation-token')
          return json(res, {}, 401)
        if (req.method === 'GET' && path.endsWith('/issues')) {
          readCount += 1
          return json(res, [])
        }
        if (req.method === 'POST' && path.endsWith('/issues')) {
          writeCount += 1
          return json(
            res,
            {
              id: writeCount,
              number: writeCount,
              title: 'Investigate',
              state: 'open',
              html_url: 'https://github.com/acme/support/issues/1',
            },
            201,
          )
        }
        json(res, {}, 404)
      })().catch((error: unknown) => {
        json(
          res,
          {
            message:
              error instanceof Error
                ? error.message
                : 'Provider fixture failed',
          },
          500,
        )
      })
    })
    await new Promise<void>((resolve) =>
      provider.listen(0, '127.0.0.1', resolve),
    )
    const address = provider.address()
    if (!address || typeof address === 'string')
      throw new Error('Provider address missing')
    process.env.GITHUB_API_BASE_URL = `http://127.0.0.1:${address.port}`
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = 'shared-test'
    process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
      'shared-test': Buffer.alloc(32, 11).toString('base64'),
    })
    const [workspace] = await db
      .insert(schema.organizations)
      .values({
        name: 'Shared integration test',
        slug: randomUUID(),
        createdAt: new Date(),
      })
      .returning()
    workspaceId = workspace.id
    const [operator] = await db
      .insert(schema.users)
      .values({ name: 'Operator', email: `${randomUUID()}@example.com` })
      .returning()
    operatorId = operator.id
    await db.insert(schema.members).values({
      organizationId: workspaceId,
      userId: operatorId,
      role: 'owner',
      createdAt: new Date(),
    })
    const application = await repositories.application.createApplication(db, {
      workspaceId,
      name: 'Customer product',
      slug: 'customer-product',
    })
    applicationId = application.id
    const environments = await repositories.environment.listEnvironments(
      db,
      workspaceId,
      applicationId,
    )
    const dev = environments.find(
      (environment) => environment.environment === 'dev',
    )
    const production = environments.find(
      (environment) => environment.environment === 'production',
    )
    if (!dev || !production) throw new Error('Fixture Environments missing')
    environmentId = dev.id
    productionId = production.id
    await repositories.environment.replaceConnectorAccessPolicy(
      db,
      workspaceId,
      environmentId,
      {
        providers: [
          {
            provider: 'github',
            actionFamilies: ['issues', 'repositories'],
            maxScopes: ['metadata:read', 'issues:read', 'issues:write'],
          },
        ],
      },
      { userId: operatorId },
    )
    const module = await Test.createTestingModule({
      imports: [ConnectionsModule, PublicRuntimeModule],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('v1')
    app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      if (req.headers['x-test-operator'] === operatorId)
        req.session = {
          user: { id: operatorId },
          session: {
            activeOrganizationId: workspaceId,
            createdAt: req.headers['x-test-stale'] ? new Date(0) : new Date(),
          },
        }
      next()
    })
    await app.listen(0)
    baseUrl = await app.getUrl()
  })
  afterAll(async () => {
    if (app) await app.close()
    if (provider)
      await new Promise<void>((resolve, reject) =>
        provider.close((error) => (error ? reject(error) : resolve())),
      )
    if (workspaceId) {
      await pool.query(
        'DELETE FROM approval_requests WHERE workspace_id = $1',
        [workspaceId],
      )
      await pool.query(
        'DELETE FROM connector_audit_facts WHERE workspace_id = $1',
        [workspaceId],
      )
      await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
    }
    if (operatorId)
      await pool.query('DELETE FROM users WHERE id=$1', [operatorId])
    await pool.end()
    const originals: [string, string | undefined][] = [
      ['GITHUB_API_BASE_URL', originalEnvironment.github],
      ['CONNECTION_CREDENTIAL_ACTIVE_KEY', originalEnvironment.active],
      ['CONNECTION_CREDENTIAL_KEYS', originalEnvironment.keys],
    ]
    for (const [name, value] of originals) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
  function admin() {
    return { 'x-test-operator': operatorId }
  }
  async function setup() {
    const response = await request(baseUrl)
      .post(
        `/v1/environments/${environmentId}/connections/github-installations`,
      )
      .set(admin())
      .send({
        appClientId: '123',
        installationId: installationId++,
        privateKey,
        permissions: { metadata: 'read', issues: 'write' },
      })
      .expect(201)
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE KEY')
    expect(JSON.stringify(response.body)).not.toContain('installation-token')
    return connectionSchema.parse(response.body)
  }
  async function subject(envId = environmentId) {
    const [created] = await db
      .insert(schema.externalSubjects)
      .values({
        workspaceId,
        issuer: 'https://identity.example.com',
        issuerSubject: randomUUID(),
        status: 'verified',
        verifiedAt: new Date(),
      })
      .returning()
    await db.insert(schema.externalSubjectEnvironments).values({
      workspaceId,
      environmentId: envId,
      externalSubjectId: created.id,
    })
    return created.id
  }
  async function execution(externalSubjectId: string, envId = environmentId) {
    const workflow = await repositories.workflow.createWorkflow(db, {
      applicationId,
      workspaceId,
      name: 'Shared action',
      slug: randomUUID(),
    })
    const version = await repositories.workflow.createWorkflowVersion(db, {
      workflowId: workflow.id,
      graph: { nodes: [], edges: [] },
      contentHash: randomUUID(),
    })
    const created = await repositories.execution.createExecution(db, {
      workspaceId,
      environmentId: envId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      externalSubjectRecordId: externalSubjectId,
      trigger: 'api',
    })
    const executionClaimId = randomUUID()
    await repositories.execution.startExecution(
      db,
      created.id,
      executionClaimId,
      new Date(Date.now() + 300000),
    )
    return {
      workspaceId,
      executionId: created.id,
      executionClaimId,
      nodeId: 'connector',
      invocationIdempotencyKey: randomUUID(),
    }
  }
  async function assign(
    connectionId: string,
    externalSubjectId: string,
    kind: 'access-grants' | 'reviewer-assignments',
  ) {
    const response = await request(baseUrl)
      .post(
        `/v1/environments/${environmentId}/connections/${connectionId}/${kind}`,
      )
      .set(admin())
      .send({ externalSubjectId })
      .expect(201)
    return z.object({ id: z.uuid() }).parse(response.body).id
  }
  async function session(externalSubjectId: string) {
    const keys = await generateKeyPair('ES256')
    const publicJwk = await exportJWK(keys.publicKey)
    const token = `lnu_${randomUUID().replaceAll('-', '')}`
    const nonce = randomUUID()
    await db.insert(schema.endUserSessions).values({
      workspaceId,
      environmentId,
      externalSubjectId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      proofJkt: await calculateJwkThumbprint(publicJwk, 'sha256'),
      nonceHash: createHash('sha256').update(nonce).digest('hex'),
      expiresAt: new Date(Date.now() + 300000),
    })
    return { token, nonce, publicJwk, privateKey: keys.privateKey }
  }
  async function proofHeaders(
    identity: Awaited<ReturnType<typeof session>>,
    method: string,
    path: string,
  ) {
    const proof = await new SignJWT({
      jti: randomUUID(),
      htm: method,
      htu: `${baseUrl}${path}`,
      iat: Math.floor(Date.now() / 1000),
      nonce: identity.nonce,
      ath: createHash('sha256').update(identity.token).digest('base64url'),
    })
      .setProtectedHeader({
        typ: 'dpop+jwt',
        alg: 'ES256',
        jwk: identity.publicJwk,
      })
      .sign(identity.privateKey)
    return { Authorization: `DPoP ${identity.token}`, DPoP: proof }
  }
  const issueInput = {
    owner: 'acme',
    repository: 'support',
    title: 'Investigate',
    body: 'Reviewed content',
    labels: [],
    assignees: [],
  }
  async function approvedWrite() {
    const connection = await setup()
    const requester = await subject()
    const reviewer = await subject()
    const grantId = await assign(connection.id, requester, 'access-grants')
    const reviewerId = await assign(
      connection.id,
      reviewer,
      'reviewer-assignments',
    )
    const input = {
      ...(await execution(requester)),
      connectionId: connection.id,
      operationId: 'github.issues.create',
      operationInput: issueInput,
    }
    const pending = await gateway.execute(input)
    if (pending.outcome !== 'awaiting_consent')
      throw new Error('Expected human consent')
    const consent = await repositories.actionIntent.getActionIntentConsent(
      db,
      input,
    )
    if (!consent) throw new Error('Consent missing')
    const path = `/v1/user/approval-requests/${consent.approvalRequest.id}/decisions`
    const requesterSession = await session(requester)
    await request(baseUrl)
      .post(path)
      .set(await proofHeaders(requesterSession, 'POST', path))
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approved' })
      .expect(404)
    const reviewerSession = await session(reviewer)
    await request(baseUrl)
      .post(path)
      .set(await proofHeaders(reviewerSession, 'POST', path))
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approved' })
      .expect(201)
    return {
      connection,
      requester,
      reviewer,
      grantId,
      reviewerId,
      input,
      intentId: pending.actionIntentId,
    }
  }
  it('requires a recent administrator session and rejects machine keys', async () => {
    const path = `/v1/environments/${environmentId}/connections/github-installations`
    const input = {
      appClientId: '123',
      installationId: 42,
      privateKey,
      permissions: { metadata: 'read', issues: 'write' },
    }
    const unauthenticated = await request(baseUrl)
      .post(path)
      .send(input)
      .expect(401)
    expect(unauthenticated.body).toMatchObject({
      message: 'Session or API key required',
    })
    await request(baseUrl)
      .post(path)
      .set({ ...admin(), 'x-test-stale': 'yes' })
      .send(input)
      .expect(403)
    const key = generateApiKey()
    await repositories.apiKey.createApiKey(db, {
      workspaceId,
      name: 'Backend',
      hashedKey: key.hashedKey,
      keyPrefix: key.keyPrefix,
    })
    const machine = await request(baseUrl)
      .post(path)
      .set('Authorization', `Bearer ${key.rawKey}`)
      .send(input)
      .expect(403)
    expect(machine.body).toMatchObject({
      message:
        "Requires a signed-in session with admin role or higher — API keys can't be used here",
    })
  })
  it('stores independent installation authority encrypted with no fictional Subject', async () => {
    const connection = await setup()
    expect(connection.ownership).toBe('environment')
    expect(connection.authorizationKind).toBe('github_app_installation')
    const stored =
      await repositories.sharedConnection.getSharedEnvironmentConnection(
        db,
        { workspaceId, environmentId },
        connection.id,
      )
    if (!stored) throw new Error('Shared Connection missing')
    expect(stored.externalSubjectId).toBeNull()
    if (!stored.credentialEncrypted)
      throw new Error('Encrypted credential missing')
    expect(
      JSON.parse(
        decryptCredential(stored.credentialEncrypted, {
          workspaceId,
          environmentId,
          externalSubjectId: null,
          recordId: stored.id,
          provider: 'github',
        }),
      ),
    ).toMatchObject({
      kind: 'github_app_installation',
      accountId: connection.providerAccountId,
    })
    await request(baseUrl)
      .get(
        `/v1/environments/${productionId}/connections/${connection.id}/authorities`,
      )
      .set(admin())
      .expect(404)
    await request(baseUrl)
      .post(
        `/v1/environments/${environmentId}/connections/${connection.id}/access-grants`,
      )
      .set(admin())
      .send({ externalSubjectId: await subject(productionId) })
      .expect(400)
  })
  it('rejects wrong App ownership and unauthorized installation permissions', async () => {
    const wrongApp = await request(baseUrl)
      .post(
        `/v1/environments/${environmentId}/connections/github-installations`,
      )
      .set(admin())
      .send({
        appClientId: 'different-app',
        installationId: installationId++,
        privateKey,
        permissions: { metadata: 'read', issues: 'write' },
      })
      .expect(400)
    expect(wrongApp.body).toMatchObject({
      message:
        'GitHub App installation could not be authorized with the supplied App credentials and permissions',
    })
    const unauthorizedPermissions = await request(baseUrl)
      .post(`/v1/environments/${productionId}/connections/github-installations`)
      .set(admin())
      .send({
        appClientId: '123',
        installationId: installationId++,
        privateKey,
        permissions: { metadata: 'read', issues: 'write' },
      })
      .expect(400)
    expect(unauthorizedPermissions.body).toMatchObject({
      message:
        'Environment GitHub policy does not authorize these installation permissions',
    })
  })
  it('requires an explicit requester grant and preserves other users when Alice is disabled', async () => {
    const connection = await setup()
    const alice = await subject()
    const bob = await subject()
    const input = {
      ...(await execution(alice)),
      connectionId: connection.id,
      operationId: 'github.issues.list',
      operationInput: { owner: 'acme', repository: 'support' },
    }
    await expect(gateway.execute(input)).rejects.toThrow(
      'Connector operation rejected',
    )
    await assign(connection.id, alice, 'access-grants')
    await assign(connection.id, bob, 'access-grants')
    expect((await gateway.execute(input)).outcome).toBe('completed')
    await repositories.externalSubject.disableExternalSubject(
      db,
      workspaceId,
      alice,
      operatorId,
    )
    await expect(gateway.execute(input)).rejects.toThrow(
      'Connector operation rejected',
    )
    expect(
      (await gateway.execute({ ...input, ...(await execution(bob)) })).outcome,
    ).toBe('completed')
    await expect(
      gateway.execute({ ...input, ...(await execution(bob, productionId)) }),
    ).rejects.toThrow('Connector operation rejected')
    expect(
      (
        await repositories.sharedConnection.getSharedEnvironmentConnection(
          db,
          { workspaceId, environmentId },
          connection.id,
        )
      )?.status,
    ).toBe('active')
  })
  it('keeps erasure compatible with requester revocation approval and Subject locks', async () => {
    const fixture = await approvedWrite()
    const consent = await repositories.actionIntent.getActionIntentConsent(
      db,
      fixture.input,
    )
    if (!consent) throw new Error('Consent missing')
    const holder = await pool.connect()
    let erased: Promise<unknown> | undefined
    try {
      await holder.query('BEGIN')
      const identity = z
        .object({ pid: z.number() })
        .parse((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0])
      await holder.query(
        'SELECT id FROM connection_access_grants WHERE id=$1 FOR UPDATE',
        [fixture.grantId],
      )
      erased = expect(
        repositories.externalSubject.eraseExternalSubject(
          db,
          workspaceId,
          fixture.requester,
          operatorId,
        ),
      ).resolves.toMatchObject({ status: 'erased' })
      const deadline = Date.now() + 5000
      while (true) {
        const blocked = z
          .object({ blocked: z.boolean() })
          .parse(
            (
              await pool.query(
                'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',
                [identity.pid],
              )
            ).rows[0],
          )
        if (blocked.blocked) break
        if (Date.now() >= deadline)
          throw new Error('Erasure did not wait for the locked grant')
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
      }
      await holder.query("SET LOCAL lock_timeout = '500ms'")
      const audit = await holder.query(
        'INSERT INTO connector_audit_facts (workspace_id, environment_id, external_subject_id, connection_id, fact_type, provider, content_expires_at, audit_expires_at) VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
        [
          workspaceId,
          environmentId,
          fixture.requester,
          fixture.connection.id,
          'action_intent.cancelled',
          'github',
        ],
      )
      expect(audit.rowCount).toBe(1)
      const approval = await holder.query(
        'SELECT id FROM approval_requests WHERE id=$1 FOR UPDATE NOWAIT',
        [consent.approvalRequest.id],
      )
      expect(approval.rowCount).toBe(1)
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
      await erased
    }
  })
  it('rejects a requester grant revoked while an installation token is being minted', async () => {
    const connection = await setup()
    const requester = await subject()
    const grantId = await assign(connection.id, requester, 'access-grants')
    const before = readCount
    const barrier = { entered: deferred(), release: deferred() }
    tokenBarrier = barrier
    const operation = gateway.execute({
      ...(await execution(requester)),
      connectionId: connection.id,
      operationId: 'github.issues.list',
      operationInput: { owner: 'acme', repository: 'support' },
    })
    const rejected = expect(operation).rejects.toThrow(
      'Connector operation rejected',
    )
    await barrier.entered.promise
    await request(baseUrl)
      .delete(
        `/v1/environments/${environmentId}/connections/${connection.id}/access-grants/${grantId}`,
      )
      .set(admin())
      .expect(200)
    barrier.release.resolve()
    await rejected
    expect(readCount).toBe(before)
  })
  it('allows requester consent only with separately assigned reviewer authority and DPoP proof', async () => {
    const connection = await setup()
    const requester = await subject()
    await assign(connection.id, requester, 'access-grants')
    const input = {
      ...(await execution(requester)),
      connectionId: connection.id,
      operationId: 'github.issues.create',
      operationInput: issueInput,
    }
    const pending = await gateway.execute(input)
    if (pending.outcome !== 'awaiting_consent')
      throw new Error('Expected human consent')
    const consent = await repositories.actionIntent.getActionIntentConsent(
      db,
      input,
    )
    if (!consent) throw new Error('Consent missing')
    const path = `/v1/user/approval-requests/${consent.approvalRequest.id}/decisions`
    const requesterSession = await session(requester)
    await request(baseUrl)
      .post(path)
      .set(await proofHeaders(requesterSession, 'POST', path))
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approved' })
      .expect(404)
    await assign(connection.id, requester, 'reviewer-assignments')
    await request(baseUrl)
      .post(path)
      .set(await proofHeaders(requesterSession, 'POST', path))
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approved' })
      .expect(201)
    const before = writeCount
    expect((await gateway.execute(input)).outcome).toBe('completed')
    expect(writeCount).toBe(before + 1)
  })
  it('approves an exact shared action through a distinct DPoP reviewer and replays the recorded outcome after revocation', async () => {
    const fixture = await approvedWrite()
    const before = writeCount
    expect((await gateway.execute(fixture.input)).outcome).toBe('completed')
    expect(writeCount).toBe(before + 1)
    await request(baseUrl)
      .delete(
        `/v1/environments/${environmentId}/connections/${fixture.connection.id}/access-grants/${fixture.grantId}`,
      )
      .set(admin())
      .expect(200)
    expect((await gateway.execute(fixture.input)).outcome).toBe('completed')
    expect(writeCount).toBe(before + 1)
    await expect(
      gateway.execute({
        ...fixture.input,
        operationInput: { ...issueInput, body: 'Unreviewed change' },
      }),
    ).rejects.toThrow('idempotency conflict')
    const newGrant = await assign(
      fixture.connection.id,
      fixture.requester,
      'access-grants',
    )
    expect(newGrant).not.toBe(fixture.grantId)
  })
  it('locks the deciding reviewer before authorizing dispatch against a concurrent disable', async () => {
    const fixture = await approvedWrite()
    const claimInput = {
      actionIntentId: fixture.intentId,
      executionClaimId: fixture.input.executionClaimId,
      provider: 'github',
      actionFamily: 'issues',
      requiredScopes: ['issues:read', 'issues:write'],
      now: new Date(),
    }
    expect(
      (
        await repositories.actionIntent.claimApprovedActionIntent(
          db,
          claimInput,
        )
      )?.outcome,
    ).toBe('claimed')
    const client = await pool.connect()
    const before = writeCount
    try {
      await client.query('BEGIN')
      await client.query(
        "UPDATE external_subjects SET status = 'disabled', disabled_at=now() WHERE id = $1",
        [fixture.reviewer],
      )
      const dispatch = repositories.actionIntent.beginActionIntentDispatch(
        db,
        claimInput,
      )
      let blocked = false
      for (let attempt = 0; attempt < 50 && !blocked; attempt += 1) {
        const result = await pool.query(
          `SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%external_subjects%' AND pid<>pg_backend_pid()`,
        )
        blocked = result.rowCount !== 0
        if (!blocked)
          await new Promise<void>((resolve) => setTimeout(resolve, 20))
      }
      expect(blocked).toBe(true)
      await client.query('COMMIT')
      expect(await dispatch).toBeUndefined()
      expect(writeCount).toBe(before)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
  it('prevents retargeting or restoring revoked authority in the migrated database', async () => {
    const connection = await setup()
    const grantId = await assign(
      connection.id,
      await subject(),
      'access-grants',
    )
    await request(baseUrl)
      .delete(
        `/v1/environments/${environmentId}/connections/${connection.id}/access-grants/${grantId}`,
      )
      .set(admin())
      .expect(200)
    await expect(
      pool.query(
        'UPDATE connection_access_grants SET revoked_at=NULL WHERE id=$1',
        [grantId],
      ),
    ).rejects.toMatchObject({ code: '55000' })
    await expect(
      pool.query(
        'UPDATE connection_access_grants SET external_subject_id=$1 WHERE id=$2',
        [await subject(), grantId],
      ),
    ).rejects.toMatchObject({ code: '55000' })
  })
  it.each([
    'requester',
    'reviewer',
    'reviewer_subject',
    'connection',
    'environment',
  ] as const)(
    'blocks %s revocation between claim and provider dispatch',
    async (kind) => {
      const fixture = await approvedWrite()
      const before = writeCount
      const barrier = { entered: deferred(), release: deferred() }
      tokenBarrier = barrier
      const operation = gateway.execute(fixture.input)
      const rejected = expect(operation).rejects.toThrow()
      await barrier.entered.promise
      if (kind === 'requester' || kind === 'reviewer')
        await request(baseUrl)
          .delete(
            `/v1/environments/${environmentId}/connections/${fixture.connection.id}/${kind === 'requester' ? 'access-grants' : 'reviewer-assignments'}/${kind === 'requester' ? fixture.grantId : fixture.reviewerId}`,
          )
          .set(admin())
          .expect(200)
      else if (kind === 'reviewer_subject')
        await repositories.externalSubject.disableExternalSubject(
          db,
          workspaceId,
          fixture.reviewer,
          operatorId,
        )
      else if (kind === 'connection')
        await request(baseUrl)
          .delete(
            `/v1/environments/${environmentId}/connections/${fixture.connection.id}`,
          )
          .set(admin())
          .expect(200)
      else
        await repositories.environment.disableEnvironment(
          db,
          workspaceId,
          environmentId,
          { userId: operatorId },
        )
      barrier.release.resolve()
      await rejected
      expect(writeCount).toBe(before)
      expect(
        (
          await repositories.actionIntent.getActionIntentConsent(
            db,
            fixture.input,
          )
        )?.intent.status,
      ).toBe('failed')
    },
  )
})
