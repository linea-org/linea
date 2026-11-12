import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { Server } from 'node:http'
import { EndUserAuthorizationController } from './end-user-authorization.controller'
import { EndUserSessionsController } from '../end-user-sessions/end-user-sessions.controller'
import { EndUserSessionGuard } from '../end-user-sessions/end-user-session.guard'
import { HttpException } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { db, pool, schema } from '@linea/db'
import { exportJWK, generateKeyPair, SignJWT } from 'jose-v5'
import { EndUserSessionService } from '../end-user-sessions/end-user-session.service'
import { EndUserAuthorizationService } from './end-user-authorization.service'
import {
  OidcIdentityVerificationError,
  type OidcProvider,
} from './oidc-provider'

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const origin = 'https://app.example.com'
const redirectUri = `${origin}/callback`
const targetUrl = 'https://api.example.com/v1/user-sessions'
const provider: OidcProvider = {
  createAuthorizationUrl(_configuration, input) {
    const url = new URL('https://identity.example.com/authorize')
    url.searchParams.set('state', input.state)
    return Promise.resolve(url.toString())
  },
  exchangeAuthorizationCode(_configuration, input) {
    if (!input.code.startsWith('valid-'))
      return Promise.reject(new OidcIdentityVerificationError())
    return Promise.resolve({ issuerSubject: input.code })
  },
}

async function status(result: Promise<unknown>): Promise<number> {
  try {
    await result
    return 200
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus()
    throw error
  }
}

describe('sign-in quota isolation (Postgres)', () => {
  const authorization = new EndUserAuthorizationService(provider)
  const sessions = new EndUserSessionService()
  const prefix = randomUUID()
  const rateKeys = new Set<string>()
  let workspaceId: string
  let environmentId: string
  let app: NestExpressApplication<Server>
  function ip(name: string): string {
    const value = `${prefix}-${name}`
    const bucket = Math.floor(Date.now() / 60_000)
    for (const operation of ['authorization', 'exchange', 'session']) {
      rateKeys.add(hash(`${operation}:ip:${value}:${bucket}`))
      rateKeys.add(hash(`${operation}:environment:${environmentId}:${bucket}`))
    }
    return value
  }
  beforeAll(async () => {
    // Keep quota clocks aligned without stalling database or HTTP timers.
    jest.useFakeTimers({
      now: Date.now(),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    })
    const [workspace] = await db
      .insert(schema.organizations)
      .values({ name: 'Quota isolation', slug: prefix, createdAt: new Date() })
      .returning()
    workspaceId = workspace.id
    const [application] = await db
      .insert(schema.applications)
      .values({ workspaceId, name: 'Quota isolation', slug: prefix })
      .returning()
    const [environment] = await db
      .insert(schema.environments)
      .values({
        workspaceId,
        applicationId: application.id,
        environment: 'production',
        displayName: 'Quota isolation',
        allowedBrowserOrigins: [origin],
        allowedRedirectOrigins: [origin],
        oidcIssuer: 'https://identity.example.com',
        oidcClientId: 'test',
        oidcAudience: 'test',
        oidcJwksUrl: 'https://identity.example.com/jwks',
      })
      .returning()
    environmentId = environment.id
    const module = await Test.createTestingModule({
      controllers: [EndUserAuthorizationController, EndUserSessionsController],
      providers: [
        { provide: EndUserAuthorizationService, useValue: authorization },
        { provide: EndUserSessionService, useValue: sessions },
      ],
    })
      .overrideGuard(EndUserSessionGuard)
      .useValue({ canActivate: () => true })
      .compile()
    app = module.createNestApplication<NestExpressApplication<Server>>()
    app.set('trust proxy', true)
    await app.init()
  })
  afterAll(async () => {
    jest.useRealTimers()
    await app.close()
    await pool.query(
      'DELETE FROM end_user_authorization_requests WHERE workspace_id = $1',
      [workspaceId],
    )
    await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
    await pool.query(
      'DELETE FROM end_user_authorization_rate_limits WHERE key = ANY($1::text[])',
      [[...rateKeys]],
    )
    await pool.end()
  })
  async function start(name: string) {
    const codeVerifier = randomBytes(32).toString('base64url')
    const result = await authorization.start(
      {
        environmentId,
        redirectUri,
        codeChallenge: createHash('sha256')
          .update(codeVerifier)
          .digest('base64url'),
      },
      origin,
      ip(name),
    )
    const state = new URL(result.authorizationUrl).searchParams.get('state')
    if (!state) throw new Error('Missing state')
    return {
      environmentId,
      redirectUri,
      state,
      codeVerifier,
      code: `valid-${randomUUID()}`,
    }
  }
  async function exchange(name: string) {
    const result = await authorization.exchange(
      await start(name),
      origin,
      ip(name),
    )
    rateKeys.add(
      hash(
        `session:subject:${environmentId}:${result.externalSubjectId}:${Math.floor(Date.now() / 60_000)}`,
      ),
    )
    return result
  }
  async function proof(nonce: string) {
    const { privateKey, publicKey } = await generateKeyPair('ES256')
    return new SignJWT({
      jti: randomUUID(),
      htm: 'POST',
      htu: targetUrl,
      iat: Math.floor(Date.now() / 1000),
      nonce,
    })
      .setProtectedHeader({
        typ: 'dpop+jwt',
        alg: 'ES256',
        jwk: await exportJWK(publicKey),
      })
      .sign(privateKey)
  }
  it('bounds invalid and refused authorization starts without draining another client', async () => {
    const attacker = ip('invalid-start')
    const results = await Promise.all(
      Array.from({ length: 320 }, () =>
        status(
          authorization.start(
            {
              environmentId,
              redirectUri: 'https://attacker.example/callback',
              codeChallenge: 'a'.repeat(43),
            },
            origin,
            attacker,
          ),
        ),
      ),
    )
    expect(results.filter((value) => value === 429)).toHaveLength(290)
    expect(results.filter((value) => value === 401)).toHaveLength(30)
    await expect(start('valid-start')).resolves.toHaveProperty('state')
    const validAttacker = ip('valid-start-flood')
    const starts = await Promise.all(
      Array.from({ length: 320 }, () =>
        status(
          authorization.start(
            { environmentId, redirectUri, codeChallenge: 'a'.repeat(43) },
            origin,
            validAttacker,
          ),
        ),
      ),
    )
    expect(starts.filter((value) => value === 200)).toHaveLength(30)
    const victim = await exchange('after-valid-flood')
    await expect(
      sessions.create(
        victim,
        await proof(victim.dpopNonce),
        'POST',
        targetUrl,
        origin,
        ip('after-start-flood'),
      ),
    ).resolves.toHaveProperty('accessToken')
  })
  it('does not create Environment quota rows for unknown IDs', async () => {
    const attacker = ip('unknown')
    const bucket = Math.floor(Date.now() / 60_000)
    const ids = Array.from({ length: 320 }, () => randomUUID())
    for (const id of ids)
      rateKeys.add(hash(`authorization:environment:${id}:${bucket}`))
    await Promise.all(
      ids.map((id) =>
        status(
          authorization.start(
            { environmentId: id, redirectUri, codeChallenge: 'a'.repeat(43) },
            origin,
            attacker,
          ),
        ),
      ),
    )
    const rows = await pool.query<{ request_count: number }>(
      'SELECT request_count FROM end_user_authorization_rate_limits WHERE key = $1',
      [hash(`authorization:ip:${attacker}:${bucket}`)],
    )
    expect(rows.rows).toEqual([{ request_count: 30 }])
    const unknownKeys = await pool.query(
      'SELECT key FROM end_user_authorization_rate_limits WHERE key = ANY($1::text[])',
      [ids.map((id) => hash(`authorization:environment:${id}:${bucket}`))],
    )
    expect(unknownKeys.rows).toHaveLength(0)
  })
  it('rejects invalid PKCE, state, codes and replays while a valid client can finish', async () => {
    const flow = await start('pkce')
    const attacker = ip('invalid-exchange')
    const attempts = await Promise.all(
      Array.from({ length: 620 }, (_, index) =>
        status(
          authorization.exchange(
            {
              ...flow,
              ...(index % 2
                ? { state: 'a'.repeat(43) }
                : { codeVerifier: 'b'.repeat(43) }),
            },
            origin,
            attacker,
          ),
        ),
      ),
    )
    expect(attempts.filter((value) => value === 429)).toHaveLength(560)
    const valid = await authorization.exchange(flow, origin, ip('pkce-valid'))
    rateKeys.add(
      hash(
        `session:subject:${environmentId}:${valid.externalSubjectId}:${Math.floor(Date.now() / 60_000)}`,
      ),
    )
    expect(
      await status(authorization.exchange(flow, origin, ip('replay'))),
    ).toBe(401)
    const invalidCode = await start('invalid-code')
    expect(
      await status(
        authorization.exchange(
          { ...invalidCode, code: 'invalid-code' },
          origin,
          ip('invalid-code'),
        ),
      ),
    ).toBe(401)
    const credential = await sessions.create(
      valid,
      await proof(valid.dpopNonce),
      'POST',
      targetUrl,
      origin,
      ip('valid-session'),
    )
    expect(credential.tokenType).toBe('DPoP')
  })
  it('invalid DPoP floods and concurrent replay cannot drain another subject', async () => {
    const attacker = await exchange('dpop-attacker')
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        status(
          sessions.create(
            attacker,
            'invalid',
            'POST',
            targetUrl,
            origin,
            ip('bad-proof'),
          ),
        ),
      ),
    )
    expect(results.filter((value) => value === 401)).toHaveLength(10)
    expect(results.filter((value) => value === 429)).toHaveLength(20)
    const signed = await proof(attacker.dpopNonce)
    const replay = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        status(
          sessions.create(
            attacker,
            signed,
            'POST',
            targetUrl,
            origin,
            ip(`replay-${index}`),
          ),
        ),
      ),
    )
    expect(replay.filter((value) => value === 200)).toHaveLength(1)
    const victim = await exchange('dpop-victim')
    await expect(
      sessions.create(
        victim,
        await proof(victim.dpopNonce),
        'POST',
        targetUrl,
        origin,
        ip('victim'),
      ),
    ).resolves.toHaveProperty('accessToken')
    const rows = await pool.query<{ request_count: number }>(
      'SELECT request_count FROM end_user_authorization_rate_limits WHERE key = $1',
      [
        hash(
          `session:subject:${environmentId}:${attacker.externalSubjectId}:${Math.floor(Date.now() / 60_000)}`,
        ),
      ],
    )
    expect(rows.rows).toEqual([{ request_count: 1 }])
  })
  it('caps concurrent subject issuance and rolls back refused exchange consumption', async () => {
    const identity = await exchange('subject-limit')
    const inputs = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const exchangeToken = `lnx_${randomUUID()}`
        const dpopNonce = randomUUID()
        await db.insert(schema.endUserIdentityExchanges).values({
          workspaceId,
          environmentId,
          externalSubjectId: identity.externalSubjectId,
          tokenHash: hash(exchangeToken),
          dpopNonceHash: hash(dpopNonce),
          expiresAt: new Date(Date.now() + 60_000),
        })
        return { exchangeToken, dpopNonce }
      }),
    )
    const outcomes = await Promise.all(
      inputs.map(async (input, index) =>
        status(
          sessions.create(
            input,
            await proof(input.dpopNonce),
            'POST',
            targetUrl,
            origin,
            ip(`subject-limit-${index}`),
          ),
        ),
      ),
    )
    expect(outcomes.filter((value) => value === 200)).toHaveLength(10)
    expect(outcomes.filter((value) => value === 429)).toHaveLength(2)
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome !== 429) continue
      const stored = await pool.query<{ consumed_at: Date | null }>(
        'SELECT consumed_at FROM end_user_identity_exchanges WHERE token_hash = $1',
        [hash(inputs[index].exchangeToken)],
      )
      expect(stored.rows).toEqual([{ consumed_at: null }])
    }
    const victim = await exchange('after-subject-limit')
    await expect(
      sessions.create(
        victim,
        await proof(victim.dpopNonce),
        'POST',
        targetUrl,
        origin,
        ip('after-subject-limit'),
      ),
    ).resolves.toHaveProperty('accessToken')
  })
  it('returns Retry-After on all three sign-in routes', async () => {
    const clientIp = ip('http')
    const bucket = Math.floor(Date.now() / 60_000)
    for (const operation of ['authorization', 'exchange', 'session']) {
      await pool.query(
        'INSERT INTO end_user_authorization_rate_limits (key, request_count, expires_at) VALUES ($1, 100, $2)',
        [
          hash(`${operation}:ip:${clientIp}:${bucket}`),
          new Date((bucket + 2) * 60_000),
        ],
      )
    }
    for (const path of ['authorization', 'exchange', '']) {
      const body =
        path === ''
          ? { exchangeToken: 'lnx_invalid' }
          : {
              environmentId,
              redirectUri,
              ...(path === 'authorization'
                ? { codeChallenge: 'a'.repeat(43) }
                : {
                    code: 'a'.repeat(20),
                    state: 'a'.repeat(43),
                    codeVerifier: 'a'.repeat(43),
                  }),
            }
      const response = await request(app.getHttpServer())
        .post(`/user-sessions${path ? `/${path}` : ''}`)
        .set('X-Forwarded-For', clientIp)
        .send(body)
      expect(response.status).toBe(429)
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
      expect(response.body).toEqual({
        error: { code: 'rate_limited', message: 'Too many requests' },
      })
    }
  })
})
