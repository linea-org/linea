import '@linea/config/env'
import { createHash, randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  GOOGLE_ACTION_SCOPES,
  googleAuthorizationScopes,
} from '@linea/connectors'
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
import {
  connectionAuthorizationResponseSchema,
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
import { startTestGoogleProvider } from './test-google-provider'
import { startTestOAuthProvider } from './test-oauth-provider'

type ProofKey = { privateKey: KeyLike; publicJwk: JWK }
type Schema<T> = { parse(value: unknown): T }

const parseJson: (value: string) => unknown = JSON.parse
const googleActionFamilies = [
  'gmail_read',
  'gmail_send',
  'calendar_read',
  'calendar_create',
  'calendar_update',
] as const

function connectorPolicy(
  enabledGoogleFamilies: readonly string[] = googleActionFamilies,
) {
  return {
    providers: [
      {
        provider: 'test',
        actionFamilies: ['test'],
        maxScopes: ['profile'],
      },
      {
        provider: 'google',
        actionFamilies: [...enabledGoogleFamilies],
        maxScopes: [...googleAuthorizationScopes(googleActionFamilies)],
      },
    ],
  }
}

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
  let provider: Awaited<ReturnType<typeof startTestOAuthProvider>>
  let google: Awaited<ReturnType<typeof startTestGoogleProvider>>

  beforeAll(async () => {
    provider = await startTestOAuthProvider()
    google = await startTestGoogleProvider()
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
        connectorAccessPolicy: connectorPolicy(),
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
      .useValue([provider.adapter, google.adapter])
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
    if (google) await google.close()
    if (workspaceId) {
      await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
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
      })
    expect(response.status).toBe(201)
    const body = responseBody(response, connectionAuthorizationResponseSchema)
    expect(typeof body.authorizationId).toBe('string')
    expect(body.authorizationUrl).toContain('/authorize')
  })

  it('connects Google by stable identity and expands scopes only through a new ceremony', async () => {
    const path = '/v1/user/connections/authorizations'
    const replaceGoogleFamilies = async (families: readonly string[]) => {
      await pool.query(
        'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
        [JSON.stringify(connectorPolicy(families)), applicationId],
      )
    }
    const authorize = async () => {
      const started = await request(baseUrl)
        .post(path)
        .set('Authorization', `DPoP ${accessToken}`)
        .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
        .send({
          provider: 'google',
          returnUri: 'http://127.0.0.1:4173/connections/callback',
        })
      const authorization = responseBody(
        started,
        connectionAuthorizationResponseSchema,
      )
      const providerResponse = await fetch(authorization.authorizationUrl, {
        redirect: 'manual',
      })
      const callback = providerResponse.headers.get('location')
      if (!callback) throw new Error('Google callback location is missing')
      const completed = await fetch(callback, { redirect: 'manual' })
      const location = completed.headers.get('location')
      if (!location) throw new Error('Application return location is missing')
      return new URL(location).searchParams.get('status')
    }
    google.selectAccount('stable-google-subject', 'stable@example.com')
    await replaceGoogleFamilies(['gmail_read'])
    await expect(authorize()).resolves.toBe('connected')
    expect(google.requestedScopes().sort()).toEqual(
      [...googleAuthorizationScopes(['gmail_read'])].sort(),
    )
    const initial = (
      await repositories.connection.listConnections(db, {
        workspaceId,
        applicationId,
        externalSubjectId,
      })
    ).find(({ provider }) => provider === 'google')
    if (!initial) throw new Error('Expected Google Connection')
    await replaceGoogleFamilies(['gmail_read', 'calendar_update'])
    await expect(authorize()).resolves.toBe('connected')
    const expanded = await repositories.connection.getConnection(
      db,
      { workspaceId, applicationId, externalSubjectId },
      initial.id,
    )
    expect(expanded).toEqual(
      expect.objectContaining({
        id: initial.id,
        providerAccountId: 'stable-google-subject',
        accountLabel: 'stable@example.com',
        credentialVersion: initial.credentialVersion + 1,
      }),
    )
    expect(expanded?.scopes).toEqual(
      expect.arrayContaining([
        GOOGLE_ACTION_SCOPES.gmail_read,
        GOOGLE_ACTION_SCOPES.calendar_update,
      ]),
    )
    await replaceGoogleFamilies(googleActionFamilies)
    google.denyScopeOnce(GOOGLE_ACTION_SCOPES.gmail_send)
    await expect(authorize()).resolves.toBe('failed')
    const denied = await repositories.connection.getConnection(
      db,
      { workspaceId, applicationId, externalSubjectId },
      initial.id,
    )
    expect(denied?.credentialVersion).toBe(expanded?.credentialVersion)
    if (!denied?.credentialEncrypted) {
      throw new Error('Expected Google credential')
    }
    const encryptionContext = {
      workspaceId,
      applicationId,
      externalSubjectId,
      recordId: denied.id,
      provider: 'google',
    }
    const beforeRefresh = parseConnectionProviderCredential(
      decryptCredential(denied.credentialEncrypted, encryptionContext),
    )
    const expired = { ...beforeRefresh, expiresAt: '2000-01-01T00:00:00.000Z' }
    await repositories.connection.rotateConnectionCredential(
      db,
      { workspaceId, applicationId, externalSubjectId },
      denied.id,
      denied.credentialVersion,
      encryptCredential(JSON.stringify(expired), encryptionContext),
      new Date(),
    )
    const refreshed = await app
      .get(ConnectionCredentialsService)
      .resolve(
        { sessionId, workspaceId, applicationId, externalSubjectId },
        denied.id,
      )
    expect(refreshed.accessToken).not.toBe(beforeRefresh.accessToken)
    expect(refreshed.refreshToken).not.toBe(beforeRefresh.refreshToken)
    expect(google.refreshCount()).toBe(1)
    google.failNextRevocation()
    const getPath = `/v1/user/connections/${denied.id}`
    const revoked = await request(baseUrl)
      .delete(getPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('DELETE', `${baseUrl}${getPath}`))
    expect(responseBody(revoked, connectionSchema).status).toBe('revoked')
    const revocations = app.get(ConnectionRevocationService)
    await revocations.poll()
    const failed = await db.query.connectionRevocationDeliveries.findFirst({
      where: { connectionId: denied.id },
    })
    expect(failed).toEqual(
      expect.objectContaining({ attemptCount: 1, deliveredAt: null }),
    )
    await revocations.poll(new Date(Date.now() + 2_000))
    const delivered = await db.query.connectionRevocationDeliveries.findFirst({
      where: { connectionId: denied.id },
    })
    expect(delivered).toEqual(
      expect.objectContaining({
        attemptCount: 2,
        credentialEncrypted: null,
      }),
    )
  })

  it('enforces the Application scope and return-origin caps', async () => {
    const path = '/v1/user/connections/authorizations'
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [
        JSON.stringify({
          providers: [
            {
              provider: 'test',
              actionFamilies: ['test'],
              maxScopes: ['different:scope'],
            },
          ],
        }),
        applicationId,
      ],
    )
    const scopeDenied = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'http://127.0.0.1:4173/connections/callback',
      })
    expect(scopeDenied.status).toBe(403)
    await pool.query(
      'UPDATE applications SET connector_access_policy = $1 WHERE id = $2',
      [JSON.stringify(connectorPolicy()), applicationId],
    )
    const returnUriDenied = await request(baseUrl)
      .post(path)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('POST', `${baseUrl}${path}`))
      .send({
        provider: 'test',
        returnUri: 'https://attacker.example/connections/callback',
      })
    expect(returnUriDenied.status).toBe(403)
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
        [JSON.stringify(connectorPolicy()), applicationId],
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
      expiresAt: new Date(Date.now() - 1_000),
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
    const listPath = '/v1/user/connections'
    const list = await request(baseUrl)
      .get(listPath)
      .set('Authorization', `DPoP ${accessToken}`)
      .set('DPoP', await createProof('GET', `${baseUrl}${listPath}`))
    expect(list.status).toBe(200)
    const listBody = responseBody(list, connectionsResponseSchema)
    const testConnections = listBody.data.filter(
      ({ provider }) => provider === 'test',
    )
    expect(testConnections).toHaveLength(1)
    expect(testConnections[0]).toMatchObject({
      provider: 'test',
      providerAccountId: 'account-one',
      accountLabel: 'Test Account',
      status: 'active',
      scopes: ['profile'],
    })
    expect(JSON.stringify(listBody)).not.toContain('test-access')
    expect(JSON.stringify(listBody)).not.toContain('test-refresh')
    const connectionId = testConnections[0]?.id
    if (!connectionId) throw new Error('Expected a listed Connection')
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
    await revocations.poll()
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

  it('does not expose Connections across Applications or subjects', async () => {
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
    const createSession = async (
      scopedApplicationId: string,
      scopedSubjectId: string,
    ) => {
      const scopedToken = `lnu_${randomUUID().replaceAll('-', '')}`
      const scopedNonce = randomUUID()
      const scopedKey = await proofKey()
      await db.insert(schema.endUserSessions).values({
        workspaceId,
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
        applicationId: otherApplication.id,
        externalSubjectId,
      },
      { applicationId, externalSubjectId: otherSubject.id },
    ]) {
      const session = await createSession(
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
