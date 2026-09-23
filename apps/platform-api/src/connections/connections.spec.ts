import '@linea/config/env'
import { createHash, randomUUID } from 'node:crypto'
import { Logger, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  db,
  decryptCredential,
  encryptCredential,
  pool,
  repositories,
  schema,
} from '@linea/db'
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
import { publicErrorResponseSchema } from '@linea/protocol/errors'
import {
  connectionAuthorizationResponseSchema,
  connectionAuthorizationSchema,
  connectionSchema,
  connectionsResponseSchema,
} from '@linea/protocol/resources'
import {
  CONNECTION_OAUTH_PROVIDERS,
  ConnectionProviderInvalidGrantError,
} from './connection-oauth-provider'
import { ConnectionCredentialsService } from './connection-credentials.service'
import { parseConnectionProviderCredential } from './connection-provider-credential'
import { ConnectionRevocationService } from './connection-revocation.service'
import { ConnectionsModule } from './connections.module'
import { startTestGithubOAuthProvider } from './test-github-oauth-provider'
import { startTestOAuthProvider } from './test-oauth-provider'

type ProofKey = { privateKey: KeyLike; publicJwk: JWK }
type Schema<T> = { parse(value: unknown): T }

const parseJson: (value: string) => unknown = JSON.parse

function responseBody<T>(response: { text: string }, schema: Schema<T>): T {
  return schema.parse(parseJson(response.text))
}

function hexHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

async function proofKey(): Promise<ProofKey> {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  return { privateKey, publicJwk: await exportJWK(publicKey) }
}

describe('OAuth Connections', () => {
  let app: INestApplication<App>
  let baseUrl: string
  let workspaceId: string
  let applicationId: string
  let accessToken: string
  let nonce: string
  let key: ProofKey
  let externalSubjectId: string
  let sessionId: string
  let crossWorkspaceId: string | undefined
  let provider: Awaited<ReturnType<typeof startTestOAuthProvider>>
  let githubProvider: Awaited<ReturnType<typeof startTestGithubOAuthProvider>>

  beforeAll(async () => {
    provider = await startTestOAuthProvider()
    githubProvider = await startTestGithubOAuthProvider()
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = 'test-v1'
    process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
      'test-v1': Buffer.alloc(32, 7).toString('base64'),
    })
    const suffix = randomUUID()
    const [workspace] = await db
      .insert(schema.organizations)
      .values({
        name: 'Connections test',
        slug: `connections-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    workspaceId = workspace.id
    const [application] = await db
      .insert(schema.applications)
      .values({
        workspaceId,
        environment: 'dev',
        displayName: 'Connections application',
        allowedBrowserOrigins: ['http://127.0.0.1:4173'],
        allowedRedirectOrigins: ['http://127.0.0.1:4173'],
        oidcIssuer: 'https://identity.example.com',
        oidcClientId: 'connections-client',
        oidcAudience: 'connections-client',
        oidcJwksUrl: 'https://identity.example.com/jwks',
        connectorAccessPolicy: {
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['profile'],
            },
            {
              provider: 'github',
              actionFamilies: ['repositories'],
              maxScopes: ['read:user', 'repo'],
            },
          ],
        },
      })
      .returning()
    applicationId = application.id
    const [subject] = await db
      .insert(schema.externalSubjects)
      .values({
        workspaceId,
        issuer: application.oidcIssuer,
        issuerSubject: 'connections-subject',
        status: 'verified',
        verifiedAt: new Date(),
      })
      .returning()
    externalSubjectId = subject.id
    await db.insert(schema.externalSubjectApplications).values({
      workspaceId,
      applicationId,
      externalSubjectId: subject.id,
    })
    accessToken = `lnu_${randomUUID().replaceAll('-', '')}`
    nonce = randomUUID()
    key = await proofKey()
    const [session] = await db
      .insert(schema.endUserSessions)
      .values({
        workspaceId,
        applicationId,
        externalSubjectId: subject.id,
        tokenHash: hexHash(accessToken),
        proofJkt: await calculateJwkThumbprint(key.publicJwk, 'sha256'),
        nonceHash: hexHash(nonce),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .returning()
    sessionId = session.id
    const moduleRef = await Test.createTestingModule({
      imports: [ConnectionsModule],
    })
      .overrideProvider(CONNECTION_OAUTH_PROVIDERS)
      .useValue([provider.adapter, githubProvider.adapter])
      .compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('v1')
    await app.listen(0)
    baseUrl = await app.getUrl()
    process.env.CONNECTION_OAUTH_CALLBACK_BASE_URL = baseUrl
  })

  afterAll(async () => {
    if (app) await app.close()
    if (provider) await provider.close()
    if (githubProvider) await githubProvider.close()
    if (workspaceId) {
      await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
    }
    if (crossWorkspaceId) {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        crossWorkspaceId,
      ])
    }
    await pool.end()
    delete process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY
    delete process.env.CONNECTION_CREDENTIAL_KEYS
    delete process.env.CONNECTION_OAUTH_CALLBACK_BASE_URL
  })

  it('starts provider authorization for the authenticated End User', async () => {
    const path = '/v1/user/connections/authorizations'
    const response = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    expect(response.status).toBe(201)
    const body = responseBody(response, connectionAuthorizationResponseSchema)
    expect(typeof body.authorizationId).toBe('string')
    expect(body.authorizationUrl).toContain('/authorize')
  })

  it('expands GitHub scopes through a new ceremony without changing Connection identity', async () => {
    const startAuthorization = async (scopes: string[]) => {
      const path = '/v1/user/connections/authorizations'
      const started = await request(baseUrl)
        .post(path)
        .set('Authorization', `DPoP ${accessToken}`)
        .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
        .send({
          provider: 'github',
          returnUri: 'http://127.0.0.1:4173/connections/callback',
          scopes,
        })
      expect(started.status).toBe(201)
      const authorization = responseBody(
        started,
        connectionAuthorizationResponseSchema,
      )
      const providerUrl = new URL(authorization.authorizationUrl)
      expect(providerUrl.searchParams.get('scope')).toBe(
        [...scopes, 'offline_access'].join(' '),
      )
      return providerUrl
    }
    const completeAuthorization = async (providerUrl: URL) => {
      const providerResponse = await fetch(providerUrl, { redirect: 'manual' })
      const callback = providerResponse.headers.get('location')
      if (!callback) throw new Error('Provider callback location is missing')
      const completed = await fetch(callback, { redirect: 'manual' })
      expect(completed.status).toBe(302)
      const returned = completed.headers.get('location')
      if (!returned) throw new Error('Application return location is missing')
      expect(new URL(returned).searchParams.get('status')).toBe('connected')
      return repositories.connection.listConnections(db, {
        workspaceId,
        applicationId,
        externalSubjectId,
      })
    }
    const authorize = async (scopes: string[]) =>
      completeAuthorization(await startAuthorization(scopes))
    const deniedPath = '/v1/user/connections/authorizations'
    const overScoped = await request(baseUrl)
      .post(deniedPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${deniedPath}`))
      .send({
        provider: 'github',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['repo'],
      })
    expect(overScoped.status).toBe(403)
    const initial = (await authorize(['read:user'])).find(
      (connection) => connection.provider === 'github',
    )
    if (!initial) throw new Error('Expected GitHub Connection')
    expect(initial).toMatchObject({
      providerAccountId: '123456',
      accountLabel: 'octocat',
      scopes: ['read:user'],
    })
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [
        JSON.stringify({
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['profile'],
            },
            {
              provider: 'github',
              actionFamilies: ['repositories', 'issues', 'pull_requests'],
              maxScopes: ['read:user', 'repo'],
            },
          ],
        }),
        applicationId,
      ],
    )
    const staleExpansion = await startAuthorization(['read:user', 'repo'])
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [
        JSON.stringify({
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['profile'],
            },
            {
              provider: 'github',
              actionFamilies: ['repositories'],
              maxScopes: ['read:user', 'repo'],
            },
          ],
        }),
        applicationId,
      ],
    )
    const staleProviderResponse = await fetch(staleExpansion, {
      redirect: 'manual',
    })
    const staleCallback = staleProviderResponse.headers.get('location')
    if (!staleCallback) throw new Error('Provider callback location is missing')
    const staleCompleted = await fetch(staleCallback, { redirect: 'manual' })
    const staleReturned = staleCompleted.headers.get('location')
    if (!staleReturned)
      throw new Error('Application return location is missing')
    expect(new URL(staleReturned).searchParams.get('status')).toBe('failed')
    const unchanged = (
      await repositories.connection.listConnections(db, {
        workspaceId,
        applicationId,
        externalSubjectId,
      })
    ).find((connection) => connection.provider === 'github')
    expect(unchanged).toMatchObject({
      id: initial.id,
      scopes: ['read:user'],
      credentialVersion: initial.credentialVersion,
    })
    const unsupportedPolicy = await startAuthorization(['read:user'])
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [
        JSON.stringify({
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['profile'],
            },
            {
              provider: 'github',
              actionFamilies: [],
              maxScopes: ['read:user', 'repo'],
            },
          ],
        }),
        applicationId,
      ],
    )
    const unsupportedProviderResponse = await fetch(unsupportedPolicy, {
      redirect: 'manual',
    })
    const unsupportedCallback =
      unsupportedProviderResponse.headers.get('location')
    if (!unsupportedCallback)
      throw new Error('Provider callback location is missing')
    const unsupportedCompleted = await fetch(unsupportedCallback, {
      redirect: 'manual',
    })
    expect(unsupportedCompleted.status).toBe(302)
    const unsupportedReturned = unsupportedCompleted.headers.get('location')
    if (!unsupportedReturned)
      throw new Error('Application return location is missing')
    expect(new URL(unsupportedReturned).searchParams.get('status')).toBe(
      'failed',
    )
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [
        JSON.stringify({
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['profile'],
            },
            {
              provider: 'github',
              actionFamilies: ['repositories', 'issues', 'pull_requests'],
              maxScopes: ['read:user', 'repo'],
            },
          ],
        }),
        applicationId,
      ],
    )
    const expanded = (await authorize(['read:user', 'repo'])).find(
      (connection) => connection.provider === 'github',
    )
    expect(expanded).toMatchObject({
      id: initial.id,
      providerAccountId: '123456',
      scopes: ['read:user', 'repo'],
      credentialVersion: initial.credentialVersion + 1,
    })
    await pool.query('DELETE FROM connections WHERE id = $1', [initial.id])
  })

  it('enforces the Application scope and return-origin caps', async () => {
    const path = '/v1/user/connections/authorizations'
    for (const body of [
      {
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['admin'],
      },
      {
        provider: 'test',
        returnUri: 'https://attacker.example/connections/callback',
        scopes: ['profile'],
      },
    ]) {
      const response = await request(baseUrl)
        .post(path)
        .set('Authorization', `DPoP ${accessToken}`)
        .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
        .send(body)
      expect(response.status).toBe(403)
    }
  })

  it('returns only a bounded failure result after a claimed callback fails', async () => {
    const path = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    const startedBody = responseBody(
      started,
      connectionAuthorizationResponseSchema,
    )
    const providerAuthorization = new URL(startedBody.authorizationUrl)
    const callback = new URL(
      `/v1/user/connections/oauth/test/callback`,
      baseUrl,
    )
    callback.searchParams.set('code', 'invalid-code')
    callback.searchParams.set(
      'state',
      providerAuthorization.searchParams.get('state') ?? '',
    )
    const failed = await fetch(callback, { redirect: 'manual' })
    expect(failed.status).toBe(302)
    const location = failed.headers.get('location')
    if (!location) throw new Error('Application return location is missing')
    const returned = new URL(location)
    expect(`${returned.origin}${returned.pathname}`).toBe(
      'http://127.0.0.1:4173/connections/callback',
    )
    expect(returned.searchParams.get('authorizationId')).toBe(
      startedBody.authorizationId,
    )
    expect(returned.searchParams.get('status')).toBe('failed')
    expect([...returned.searchParams.keys()].sort()).toEqual([
      'authorizationId',
      'status',
    ])
    const resultPath = `/v1/user/connections/authorizations/${startedBody.authorizationId}`
    const result = await request(baseUrl)
      .get(resultPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${resultPath}`))
    expect(result.status).toBe(200)
    expect(responseBody(result, connectionAuthorizationSchema)).toMatchObject({
      id: startedBody.authorizationId,
      status: 'failed',
      connectionId: null,
    })
  })

  it('completes an OAuth denial with a bounded failure redirect', async () => {
    const path = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    const startedBody = responseBody(
      started,
      connectionAuthorizationResponseSchema,
    )
    const providerAuthorization = new URL(startedBody.authorizationUrl)
    const callback = new URL(
      `/v1/user/connections/oauth/test/callback`,
      baseUrl,
    )
    callback.searchParams.set('error', 'access_denied')
    callback.searchParams.set('error_description', 'User cancelled')
    callback.searchParams.set(
      'state',
      providerAuthorization.searchParams.get('state') ?? '',
    )
    const denied = await fetch(callback, { redirect: 'manual' })
    expect(denied.status).toBe(302)
    const location = denied.headers.get('location')
    if (!location) throw new Error('Application return location is missing')
    const returned = new URL(location)
    expect(returned.searchParams.get('authorizationId')).toBe(
      startedBody.authorizationId,
    )
    expect(returned.searchParams.get('status')).toBe('failed')
    expect([...returned.searchParams.keys()].sort()).toEqual([
      'authorizationId',
      'status',
    ])
  })

  it('rechecks current Application policy before storing a credential', async () => {
    const path = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    const startedBody = responseBody(
      started,
      connectionAuthorizationResponseSchema,
    )
    const providerResponse = await fetch(startedBody.authorizationUrl, {
      redirect: 'manual',
    })
    const callback = providerResponse.headers.get('location')
    if (!callback) throw new Error('Provider callback location is missing')
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [JSON.stringify({ providers: [] }), applicationId],
    )
    try {
      const completed = await fetch(callback, { redirect: 'manual' })
      expect(completed.status).toBe(302)
      const location = completed.headers.get('location')
      if (!location) throw new Error('Application return location is missing')
      expect(new URL(location).searchParams.get('status')).toBe('failed')
    } finally {
      await pool.query(
        'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
        [
          JSON.stringify({
            providers: [
              {
                provider: 'test',
                actionFamilies: ['test'],
                maxScopes: ['profile'],
              },
            ],
          }),
          applicationId,
        ],
      )
    }
    const stored = await db.query.connections.findFirst({
      where: {
        applicationId,
        externalSubjectId,
        providerAccountId: 'account-one',
      },
    })
    expect(stored).toBeUndefined()
  })

  it('deletes expired authorization metadata during the recovery sweep', async () => {
    const authorizationId = randomUUID()
    await db.insert(schema.connectionAuthorizationRequests).values({
      id: authorizationId,
      workspaceId,
      applicationId,
      externalSubjectId,
      endUserSessionId: sessionId,
      provider: 'test',
      scopes: ['profile'],
      returnUri: 'http://127.0.0.1:4173/connections/callback',
      stateHash: hexHash(randomUUID()),
      codeVerifierEncrypted: 'expired',
      expiresAt: new Date(Date.now() - 25 * 60 * 60_000),
    })
    await app.get(ConnectionRevocationService).poll()
    const expired = await db.query.connectionAuthorizationRequests.findFirst({
      where: { id: authorizationId },
    })
    expect(expired).toBeUndefined()
  })

  it('terminates the provider callback at Linea and returns a bounded result', async () => {
    const path = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    const startedBody = responseBody(
      started,
      connectionAuthorizationResponseSchema,
    )
    const providerResponse = await fetch(startedBody.authorizationUrl, {
      redirect: 'manual',
    })
    expect(providerResponse.status).toBe(302)
    const callbackLocation = providerResponse.headers.get('location')
    if (!callbackLocation)
      throw new Error('Provider callback location is missing')
    const callbackResponse = await fetch(callbackLocation, {
      redirect: 'manual',
    })
    expect(callbackResponse.status).toBe(302)
    const returnLocation = callbackResponse.headers.get('location')
    if (!returnLocation)
      throw new Error('Application return location is missing')
    const returned = new URL(returnLocation)
    expect(`${returned.origin}${returned.pathname}`).toBe(
      'http://127.0.0.1:4173/connections/callback',
    )
    expect(returned.searchParams.get('authorizationId')).toBe(
      startedBody.authorizationId,
    )
    expect(returned.searchParams.get('status')).toBe('connected')
    const authorizationPath = `/v1/user/connections/authorizations/${startedBody.authorizationId}`
    const authorization = await request(baseUrl)
      .get(authorizationPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${authorizationPath}`))
    expect(authorization.status).toBe(200)
    const authorizationBody = responseBody(
      authorization,
      connectionAuthorizationSchema,
    )
    expect(authorizationBody).toMatchObject({
      id: startedBody.authorizationId,
      provider: 'test',
      scopes: ['profile'],
      status: 'succeeded',
    })
    expect(Object.keys(authorizationBody).sort()).toEqual([
      'completedAt',
      'connectionId',
      'createdAt',
      'expiresAt',
      'id',
      'provider',
      'scopes',
      'status',
    ])
    const listPath = '/v1/user/connections'
    const list = await request(baseUrl)
      .get(listPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${listPath}`))
    expect(list.status).toBe(200)
    const listBody = responseBody(list, connectionsResponseSchema)
    expect(listBody.data).toHaveLength(1)
    expect(listBody).not.toHaveProperty('nextCursor')
    expect(listBody.data[0]).toMatchObject({
      provider: 'test',
      providerAccountId: 'account-one',
      accountLabel: 'Test Account',
      status: 'active',
      scopes: ['profile'],
    })
    expect(JSON.stringify(listBody)).not.toContain('test-access')
    expect(JSON.stringify(listBody)).not.toContain('test-refresh')
    const connectionId = listBody.data[0]?.id
    if (!connectionId) throw new Error('Expected a listed Connection')
    expect(authorizationBody.connectionId).toBe(connectionId)
    expect(
      await db.query.connectionAuthorizationRequests.findFirst({
        where: { id: startedBody.authorizationId },
      }),
    ).toMatchObject({ endUserSessionId: null })
    const secondToken = `lnu_${randomUUID().replaceAll('-', '')}`
    const secondNonce = randomUUID()
    const secondKey = await proofKey()
    await db.insert(schema.endUserSessions).values({
      workspaceId,
      applicationId,
      externalSubjectId,
      tokenHash: hexHash(secondToken),
      proofJkt: await calculateJwkThumbprint(secondKey.publicJwk, 'sha256'),
      nonceHash: hexHash(secondNonce),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    })
    const secondSessionAuthorization = await request(baseUrl)
      .get(authorizationPath)
      .set('Authorization', `DPoP ${secondToken}`)
      .set(
        'DPoP',
        await createProofFor(
          'GET',
          `${baseUrl}${authorizationPath}`,
          secondToken,
          secondNonce,
          secondKey,
        ),
      )
    expect(secondSessionAuthorization.status).toBe(200)
    expect(
      responseBody(secondSessionAuthorization, connectionAuthorizationSchema)
        .connectionId,
    ).toBe(connectionId)
    const beforeRefresh = await repositories.connection.getConnection(
      db,
      { workspaceId, applicationId, externalSubjectId },
      connectionId,
    )
    if (!beforeRefresh?.credentialEncrypted) {
      throw new Error('Expected active Connection credential')
    }
    const context = {
      workspaceId,
      applicationId,
      externalSubjectId,
      recordId: connectionId,
      provider: 'test',
    }
    const expired = {
      ...parseConnectionProviderCredential(
        decryptCredential(beforeRefresh.credentialEncrypted, context),
        beforeRefresh.scopes,
      ),
      expiresAt: '2000-01-01T00:00:00.000Z',
    }
    await repositories.connection.rotateConnectionCredential(
      db,
      { workspaceId, applicationId, externalSubjectId },
      connectionId,
      beforeRefresh.credentialVersion,
      encryptCredential(JSON.stringify(expired), context),
      new Date(),
    )
    const refreshed = await app
      .get(ConnectionCredentialsService)
      .resolve(
        { sessionId, workspaceId, applicationId, externalSubjectId },
        connectionId,
      )
    expect(refreshed.accessToken).not.toBe(expired.accessToken)
    const afterRefresh = await repositories.connection.getConnection(
      db,
      { workspaceId, applicationId, externalSubjectId },
      connectionId,
    )
    expect(afterRefresh?.credentialVersion).toBe(
      beforeRefresh.credentialVersion + 2,
    )
    const getPath = `/v1/user/connections/${connectionId}`
    const inspected = await request(baseUrl)
      .get(getPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${getPath}`))
    expect(inspected.status).toBe(200)
    expect(responseBody(inspected, connectionSchema).id).toBe(connectionId)
    const replay = await fetch(callbackLocation, { redirect: 'manual' })
    expect(replay.status).toBe(400)
    provider.rejectNextRevocation()
    const revoked = await request(baseUrl)
      .delete(getPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('DELETE', `${baseUrl}${getPath}`))
    expect(revoked.status).toBe(200)
    expect(responseBody(revoked, connectionSchema)).toEqual(
      expect.objectContaining({ id: connectionId, status: 'revoked' }),
    )
    const stored = await db.query.connections.findFirst({
      where: { id: connectionId },
    })
    expect(stored?.credentialEncrypted).toBeNull()
    expect(provider.wasAccountRevoked('account-one')).toBe(false)
    const pendingDelivery =
      await db.query.connectionRevocationDeliveries.findFirst({
        where: { connectionId },
      })
    const revocationEncrypted = pendingDelivery?.credentialEncrypted
    expect(revocationEncrypted).not.toBeNull()
    if (!revocationEncrypted) {
      throw new Error('Expected pending revocation credential')
    }
    expect(() =>
      decryptCredential(revocationEncrypted, {
        workspaceId,
        applicationId,
        externalSubjectId,
        recordId: connectionId,
        provider: 'test',
      }),
    ).toThrow()
    expect(pendingDelivery?.attemptCount).toBe(0)
    expect(pendingDelivery?.deliveredAt).toBeNull()
    const revocations = app.get(ConnectionRevocationService)
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined)
    await revocations.poll()
    const warnings = JSON.stringify(warn.mock.calls)
    warn.mockRestore()
    expect(warnings).toContain('provider_error')
    expect(warnings).not.toContain(revocationEncrypted)
    expect(warnings).not.toContain('Provider revocation failed')
    const failedDelivery =
      await db.query.connectionRevocationDeliveries.findFirst({
        where: { connectionId },
      })
    expect(failedDelivery?.attemptCount).toBe(1)
    expect(failedDelivery?.credentialEncrypted).not.toBeNull()
    expect(failedDelivery?.deliveredAt).toBeNull()
    await revocations.poll(new Date(Date.now() + 2_000))
    expect(provider.wasAccountRevoked('account-one')).toBe(true)
    const delivery = await db.query.connectionRevocationDeliveries.findFirst({
      where: { connectionId },
    })
    expect(delivery?.credentialEncrypted).toBeNull()
    expect(delivery?.attemptCount).toBe(2)
    expect(delivery?.deliveredAt).toBeInstanceOf(Date)
    const expiredDeliveryId = randomUUID()
    await db.insert(schema.connectionRevocationDeliveries).values({
      id: expiredDeliveryId,
      workspaceId,
      connectionId,
      provider: 'test',
      credentialEncrypted: encryptCredential('expired-revocation', {
        workspaceId,
        applicationId,
        externalSubjectId,
        recordId: expiredDeliveryId,
        provider: 'test:revocation',
      }),
      availableAt: new Date(Date.now() - 2_000),
      expiresAt: new Date(Date.now() - 1_000),
    })
    await revocations.poll()
    expect(
      await db.query.connectionRevocationDeliveries.findFirst({
        where: { id: expiredDeliveryId },
      }),
    ).toBeUndefined()
  })

  it('transitions an invalid refresh grant without an unbounded retry', async () => {
    const path = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    const startedBody = responseBody(
      started,
      connectionAuthorizationResponseSchema,
    )
    const authorized = await fetch(startedBody.authorizationUrl, {
      redirect: 'manual',
    })
    const callback = authorized.headers.get('location')
    if (!callback) throw new Error('Provider callback location is missing')
    expect((await fetch(callback, { redirect: 'manual' })).status).toBe(302)
    const listPath = '/v1/user/connections'
    const listed = await request(baseUrl)
      .get(listPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${listPath}`))
    const active = responseBody(listed, connectionsResponseSchema).data.find(
      (connection) => connection.status === 'active',
    )
    if (!active) throw new Error('Expected an active Connection')
    const stored = await repositories.connection.getConnection(
      db,
      { workspaceId, applicationId, externalSubjectId },
      active.id,
    )
    if (!stored?.credentialEncrypted) {
      throw new Error('Expected active Connection credential')
    }
    const context = {
      workspaceId,
      applicationId,
      externalSubjectId,
      recordId: active.id,
      provider: 'test',
    }
    const expired = {
      ...parseConnectionProviderCredential(
        decryptCredential(stored.credentialEncrypted, context),
        stored.scopes,
      ),
      expiresAt: '2000-01-01T00:00:00.000Z',
    }
    await repositories.connection.rotateConnectionCredential(
      db,
      { workspaceId, applicationId, externalSubjectId },
      active.id,
      stored.credentialVersion,
      encryptCredential(JSON.stringify(expired), context),
      new Date(),
    )
    provider.rejectNextRefresh()
    await expect(
      app
        .get(ConnectionCredentialsService)
        .resolve(
          { sessionId, workspaceId, applicationId, externalSubjectId },
          active.id,
        ),
    ).rejects.toBeInstanceOf(ConnectionProviderInvalidGrantError)
    const reauthorizationRequired = await repositories.connection.getConnection(
      db,
      { workspaceId, applicationId, externalSubjectId },
      active.id,
    )
    expect(reauthorizationRequired).toEqual(
      expect.objectContaining({
        status: 'reauthorization_required',
        credentialEncrypted: null,
      }),
    )
  })

  it('keeps multiple stable provider accounts isolated for one subject', async () => {
    provider.selectAccount('account-two', 'Second Test Account')
    const path = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    const startedBody = responseBody(
      started,
      connectionAuthorizationResponseSchema,
    )
    const authorized = await fetch(startedBody.authorizationUrl, {
      redirect: 'manual',
    })
    const callback = authorized.headers.get('location')
    if (!callback) throw new Error('Provider callback location is missing')
    expect((await fetch(callback, { redirect: 'manual' })).status).toBe(302)
    const listPath = '/v1/user/connections'
    const listed = await request(baseUrl)
      .get(listPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${listPath}`))
    const providerAccountIds = responseBody(
      listed,
      connectionsResponseSchema,
    ).data.map(({ providerAccountId }) => providerAccountId)
    expect(providerAccountIds).toContain('account-one')
    expect(providerAccountIds).toContain('account-two')
    const secondAccount = responseBody(
      listed,
      connectionsResponseSchema,
    ).data.find(({ providerAccountId }) => providerAccountId === 'account-two')
    if (!secondAccount) throw new Error('Expected the second provider account')
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [
        JSON.stringify({
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['profile', 'write'],
            },
          ],
        }),
        applicationId,
      ],
    )
    const upgradePath = `/v1/user/connections/${secondAccount.id}/authorizations`
    const upgrade = await request(baseUrl)
      .post(upgradePath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${upgradePath}`))
      .send({
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile', 'write'],
      })
    expect(upgrade.status).toBe(201)
    const upgradeBody = responseBody(
      upgrade,
      connectionAuthorizationResponseSchema,
    )
    const providerUpgrade = await fetch(upgradeBody.authorizationUrl, {
      redirect: 'manual',
    })
    const upgradeCallback = providerUpgrade.headers.get('location')
    if (!upgradeCallback) throw new Error('Provider callback is missing')
    expect((await fetch(upgradeCallback, { redirect: 'manual' })).status).toBe(
      302,
    )
    const upgraded = await request(baseUrl)
      .get(`/v1/user/connections/${secondAccount.id}`)
      .set('Authorization', `DPoP ${accessToken}`)
      .set(
        'DPoP',
        await createProof(
          'GET',
          `${baseUrl}/v1/user/connections/${secondAccount.id}`,
        ),
      )
    expect(responseBody(upgraded, connectionSchema)).toMatchObject({
      id: secondAccount.id,
      providerAccountId: 'account-two',
      scopes: ['profile', 'write'],
    })
    const unchanged = await request(baseUrl)
      .post(upgradePath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${upgradePath}`))
      .send({
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile', 'write'],
      })
    expect(unchanged.status).toBe(403)
    expect(publicErrorResponseSchema.parse(unchanged.body).error.code).toBe(
      'connection_scope_insufficient',
    )
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [
        JSON.stringify({
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['profile', 'write', 'archive'],
            },
          ],
        }),
        applicationId,
      ],
    )
    provider.selectAccount('account-one', 'Test Account')
    const mismatched = await request(baseUrl)
      .post(upgradePath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${upgradePath}`))
      .send({
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile', 'write', 'archive'],
      })
    expect(mismatched.status).toBe(201)
    const mismatchedBody = responseBody(
      mismatched,
      connectionAuthorizationResponseSchema,
    )
    const mismatchedProvider = await fetch(mismatchedBody.authorizationUrl, {
      redirect: 'manual',
    })
    const mismatchedCallback = mismatchedProvider.headers.get('location')
    if (!mismatchedCallback) throw new Error('Provider callback is missing')
    const mismatchedResult = await fetch(mismatchedCallback, {
      redirect: 'manual',
    })
    const mismatchedLocation = mismatchedResult.headers.get('location')
    if (!mismatchedLocation) throw new Error('Application return is missing')
    expect(new URL(mismatchedLocation).searchParams.get('status')).toBe(
      'failed',
    )
    provider.selectAccount('account-two', 'Second Test Account')
    provider.grantNextAuthorizationScopes(['profile', 'write'])
    const partialGrant = await request(baseUrl)
      .post(upgradePath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${upgradePath}`))
      .send({
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile', 'write', 'archive'],
      })
    expect(partialGrant.status).toBe(201)
    const partialGrantBody = responseBody(
      partialGrant,
      connectionAuthorizationResponseSchema,
    )
    const partialProvider = await fetch(partialGrantBody.authorizationUrl, {
      redirect: 'manual',
    })
    const partialCallback = partialProvider.headers.get('location')
    if (!partialCallback) throw new Error('Provider callback is missing')
    const partialResult = await fetch(partialCallback, { redirect: 'manual' })
    const partialLocation = partialResult.headers.get('location')
    if (!partialLocation) throw new Error('Application return is missing')
    expect(new URL(partialLocation).searchParams.get('status')).toBe('failed')
    const afterRejectedUpgrades = await request(baseUrl)
      .get(`/v1/user/connections/${secondAccount.id}`)
      .set('Authorization', `DPoP ${accessToken}`)
      .set(
        'DPoP',
        await createProof(
          'GET',
          `${baseUrl}/v1/user/connections/${secondAccount.id}`,
        ),
      )
    expect(
      responseBody(afterRejectedUpgrades, connectionSchema).scopes,
    ).toEqual(['profile', 'write'])
  })

  it('keeps credentials decryptable across concurrent callbacks', async () => {
    provider.selectAccount('account-concurrent', 'Concurrent Test Account')
    const path = '/v1/user/connections/authorizations'
    const started = await Promise.all(
      [0, 1].map(async () => {
        const response = await request(baseUrl)
          .post(path)
          .set('Authorization', `DPoP ${accessToken}`)
          .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
          .send({
            provider: 'test',
            returnUri: 'http://127.0.0.1:4173/connections/callback',
            scopes: ['profile'],
          })
        return responseBody(response, connectionAuthorizationResponseSchema)
      }),
    )
    const callbacks = await Promise.all(
      started.map(async ({ authorizationUrl }) => {
        const authorized = await fetch(authorizationUrl, { redirect: 'manual' })
        const callback = authorized.headers.get('location')
        if (!callback) throw new Error('Provider callback location is missing')
        return callback
      }),
    )
    const completed = await Promise.all(
      callbacks.map((callback) => fetch(callback, { redirect: 'manual' })),
    )
    expect(completed.every(({ status }) => status === 302)).toBe(true)
    const results = completed.map((response) => {
      const location = response.headers.get('location')
      if (!location) throw new Error('Application return location is missing')
      return new URL(location).searchParams.get('status')
    })
    expect(results).toContain('connected')
    const active = (
      await repositories.connection.listConnections(db, {
        workspaceId,
        applicationId,
        externalSubjectId,
      })
    ).filter(
      (connection) =>
        connection.providerAccountId === 'account-concurrent' &&
        connection.status === 'active',
    )
    expect(active).toHaveLength(1)
    const [connection] = active
    if (!connection) throw new Error('Expected one concurrent Connection')
    await expect(
      app
        .get(ConnectionCredentialsService)
        .resolve(
          { sessionId, workspaceId, applicationId, externalSubjectId },
          connection.id,
        ),
    ).resolves.toEqual(
      expect.objectContaining({ accountId: 'account-concurrent' }),
    )
  })

  it('paginates Connections with opaque cursors', async () => {
    const firstPath = '/v1/user/connections?limit=1'
    const first = await request(baseUrl)
      .get(firstPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${firstPath}`))
    expect(first.status).toBe(200)
    const firstPage = responseBody(first, connectionsResponseSchema)
    expect(firstPage.data).toHaveLength(1)
    expect(firstPage.nextCursor).not.toBeNull()
    const secondPath = `/v1/user/connections?limit=1&cursor=${firstPage.nextCursor}`
    const second = await request(baseUrl)
      .get(secondPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${secondPath}`))
    expect(second.status).toBe(200)
    const secondPage = responseBody(second, connectionsResponseSchema)
    expect(secondPage.data).toHaveLength(1)
    expect(secondPage.data[0]?.id).not.toBe(firstPage.data[0]?.id)
    const listPath = '/v1/user/connections'
    const emptyListPath = `${listPath}?cursor=`
    const [omittedList, emptyList] = await Promise.all([
      request(baseUrl)
        .get(listPath)
        .set('Authorization', `DPoP ${accessToken}`)
        .set('DPoP', await createProof('GET', `${baseUrl}${listPath}`)),
      request(baseUrl)
        .get(emptyListPath)
        .set('Authorization', `DPoP ${accessToken}`)
        .set('DPoP', await createProof('GET', `${baseUrl}${emptyListPath}`)),
    ])
    expect(emptyList.status).toBe(200)
    expect(emptyList.body).toEqual(omittedList.body)
    const connectionId = firstPage.data[0]?.id
    if (!connectionId) throw new Error('Expected a paginated Connection')
    const usesPath = `/v1/user/connections/${connectionId}/uses`
    const emptyUsesPath = `${usesPath}?cursor=`
    const [omittedUses, emptyUses] = await Promise.all([
      request(baseUrl)
        .get(usesPath)
        .set('Authorization', `DPoP ${accessToken}`)
        .set('DPoP', await createProof('GET', `${baseUrl}${usesPath}`)),
      request(baseUrl)
        .get(emptyUsesPath)
        .set('Authorization', `DPoP ${accessToken}`)
        .set('DPoP', await createProof('GET', `${baseUrl}${emptyUsesPath}`)),
    ])
    expect(emptyUses.status).toBe(200)
    expect(emptyUses.body).toEqual(omittedUses.body)
  })
  it('does not expose Connections across Applications or subjects', async () => {
    const authorizationPath = '/v1/user/connections/authorizations'
    const started = await request(baseUrl)
      .post(authorizationPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${authorizationPath}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
        scopes: ['profile'],
      })
    const authorizationId = responseBody(
      started,
      connectionAuthorizationResponseSchema,
    ).authorizationId
    const ownListPath = '/v1/user/connections?limit=1'
    const ownList = await request(baseUrl)
      .get(ownListPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${ownListPath}`))
    const ownConnectionId = responseBody(ownList, connectionsResponseSchema)
      .data[0]?.id
    if (!ownConnectionId) throw new Error('Expected an owned Connection')
    const suffix = randomUUID()
    const [otherApplication] = await db
      .insert(schema.applications)
      .values({
        workspaceId,
        environment: 'dev',
        displayName: 'Other Connections application',
        allowedBrowserOrigins: ['http://127.0.0.1:4174'],
        allowedRedirectOrigins: ['http://127.0.0.1:4174'],
        oidcIssuer: 'https://identity.example.com',
        oidcClientId: `other-connections-${suffix}`,
        oidcAudience: `other-connections-${suffix}`,
        oidcJwksUrl: 'https://identity.example.com/jwks',
      })
      .returning()
    await db.insert(schema.externalSubjectApplications).values({
      workspaceId,
      applicationId: otherApplication.id,
      externalSubjectId,
    })
    const [otherSubject] = await db
      .insert(schema.externalSubjects)
      .values({
        workspaceId,
        issuer: 'https://identity.example.com',
        issuerSubject: `connections-other-subject-${suffix}`,
        status: 'verified',
        verifiedAt: new Date(),
      })
      .returning()
    await db.insert(schema.externalSubjectApplications).values({
      workspaceId,
      applicationId,
      externalSubjectId: otherSubject.id,
    })
    const [crossWorkspace] = await db
      .insert(schema.organizations)
      .values({
        name: 'Cross-workspace Connections test',
        slug: `cross-workspace-connections-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    crossWorkspaceId = crossWorkspace.id
    const [crossApplication] = await db
      .insert(schema.applications)
      .values({
        workspaceId: crossWorkspace.id,
        environment: 'dev',
        displayName: 'Cross-workspace Connections application',
        allowedBrowserOrigins: ['http://127.0.0.1:4175'],
        allowedRedirectOrigins: ['http://127.0.0.1:4175'],
        oidcIssuer: 'https://identity.example.com',
        oidcClientId: `cross-workspace-connections-${suffix}`,
        oidcAudience: `cross-workspace-connections-${suffix}`,
        oidcJwksUrl: 'https://identity.example.com/jwks',
      })
      .returning()
    const [crossSubject] = await db
      .insert(schema.externalSubjects)
      .values({
        workspaceId: crossWorkspace.id,
        issuer: 'https://identity.example.com',
        issuerSubject: `connections-cross-workspace-subject-${suffix}`,
        status: 'verified',
        verifiedAt: new Date(),
      })
      .returning()
    await db.insert(schema.externalSubjectApplications).values({
      workspaceId: crossWorkspace.id,
      applicationId: crossApplication.id,
      externalSubjectId: crossSubject.id,
    })
    const createSession = async (
      scopedWorkspaceId: string,
      scopedApplicationId: string,
      scopedSubjectId: string,
    ) => {
      const scopedToken = `lnu_${randomUUID().replaceAll('-', '')}`
      const scopedNonce = randomUUID()
      const scopedKey = await proofKey()
      await db.insert(schema.endUserSessions).values({
        workspaceId: scopedWorkspaceId,
        applicationId: scopedApplicationId,
        externalSubjectId: scopedSubjectId,
        tokenHash: hexHash(scopedToken),
        proofJkt: await calculateJwkThumbprint(scopedKey.publicJwk, 'sha256'),
        nonceHash: hexHash(scopedNonce),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      return { token: scopedToken, nonce: scopedNonce, key: scopedKey }
    }
    const listPath = '/v1/user/connections'
    for (const scoped of [
      {
        workspaceId,
        applicationId: otherApplication.id,
        externalSubjectId,
      },
      { workspaceId, applicationId, externalSubjectId: otherSubject.id },
      {
        workspaceId: crossWorkspace.id,
        applicationId: crossApplication.id,
        externalSubjectId: crossSubject.id,
      },
    ]) {
      const session = await createSession(
        scoped.workspaceId,
        scoped.applicationId,
        scoped.externalSubjectId,
      )
      const listed = await request(baseUrl)
        .get(listPath)
        .set('Authorization', `DPoP ${session.token}`)
        .set(
          'DPoP',
          await createProofFor(
            'GET',
            `${baseUrl}${listPath}`,
            session.token,
            session.nonce,
            session.key,
          ),
        )
      expect(responseBody(listed, connectionsResponseSchema).data).toEqual([])
      for (const hiddenPath of [
        `/v1/user/connections/authorizations/${authorizationId}`,
        `/v1/user/connections/${ownConnectionId}`,
        `/v1/user/connections/${ownConnectionId}/uses`,
      ]) {
        const hidden = await request(baseUrl)
          .get(hiddenPath)
          .set('Authorization', `DPoP ${session.token}`)
          .set(
            'DPoP',
            await createProofFor(
              'GET',
              `${baseUrl}${hiddenPath}`,
              session.token,
              session.nonce,
              session.key,
            ),
          )
        expect(hidden.status).toBe(404)
      }
      const upgradePath = `/v1/user/connections/${ownConnectionId}/authorizations`
      const hiddenUpgrade = await request(baseUrl)
        .post(upgradePath)
        .set('Authorization', `DPoP ${session.token}`)
        .set(
          'DPoP',
          await createProofFor(
            'POST',
            `${baseUrl}${upgradePath}`,
            session.token,
            session.nonce,
            session.key,
          ),
        )
        .send({
          returnUri: 'http://127.0.0.1:4173/connections/callback',
          scopes: ['profile', 'write'],
        })
      expect(hiddenUpgrade.status).toBe(404)
      const revokePath = `/v1/user/connections/${ownConnectionId}`
      const hiddenRevoke = await request(baseUrl)
        .delete(revokePath)
        .set('Authorization', `DPoP ${session.token}`)
        .set(
          'DPoP',
          await createProofFor(
            'DELETE',
            `${baseUrl}${revokePath}`,
            session.token,
            session.nonce,
            session.key,
          ),
        )
      expect(hiddenRevoke.status).toBe(404)
    }
  })

  async function createProof(method: string, url: string): Promise<string> {
    return createProofFor(method, url, accessToken, nonce, key)
  }

  async function createProofFor(
    method: string,
    url: string,
    token: string,
    proofNonce: string,
    proof: ProofKey,
  ): Promise<string> {
    return new SignJWT({
      jti: randomUUID(),
      htm: method,
      htu: url,
      iat: Math.floor(Date.now() / 1000),
      nonce: proofNonce,
      ath: tokenHash(token),
    })
      .setProtectedHeader({
        typ: 'dpop+jwt',
        alg: 'ES256',
        jwk: proof.publicJwk,
      })
      .sign(proof.privateKey)
  }
})
