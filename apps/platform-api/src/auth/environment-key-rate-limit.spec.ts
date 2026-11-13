import { configureTestEnvironment } from '@linea/db/testing'
import { getTestApplicationId } from '@linea/db/testing'
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { db, pool, repositories, schema } from '@linea/db'
import type { EnvironmentKeyScope } from '@linea/protocol/resources'
import { PublicRuntimeRateLimitFilter } from '../public-runtime/public-runtime-rate-limit.filter'
import { generateEnvironmentKey } from './api-key.util'
import { EnvironmentKeyGuard } from './environment-key.guard'
import { EnvironmentScopeGuard } from './environment-scope.guard'
import { RequireEnvironmentScopes } from './require-environment-scopes.decorator'

@Controller('environments/:environmentId/probe')
@UseGuards(EnvironmentKeyGuard, EnvironmentScopeGuard)
class EnvironmentProbeController {
  @Get()
  @RequireEnvironmentScopes('executions:read')
  read() {
    return { ok: true }
  }

  @Post()
  @RequireEnvironmentScopes('executions:start')
  write() {
    return { ok: true }
  }
}

async function createApp() {
  const module = await Test.createTestingModule({
    controllers: [EnvironmentProbeController],
  }).compile()
  const app = module.createNestApplication<NestExpressApplication<Server>>()
  app.useGlobalFilters(new PublicRuntimeRateLimitFilter())
  await app.init()
  return app
}

describe('Environment key rate limits and activity audit (Postgres)', () => {
  const workspaceIds: string[] = []
  const counterOwners: string[] = []
  let actorId: string
  let instances: NestExpressApplication<Server>[]
  async function createKey(
    scopes: EnvironmentKeyScope[],
    workspaceId?: string,
  ) {
    let workspace = workspaceId
    if (!workspace) {
      const [organization] = await db
        .insert(schema.organizations)
        .values({
          name: 'Environment key rate limits',
          slug: `environment-key-rate-${randomUUID()}`,
          createdAt: new Date(),
        })
        .returning()
      workspaceIds.push(organization.id)
      counterOwners.push(organization.id)
      workspace = organization.id
    }
    const environment = await configureTestEnvironment(db, {
      applicationId: await getTestApplicationId(db, workspace),
      workspaceId: workspace,
      environment: 'production',
      displayName: 'Rate limited backend',
      allowedBrowserOrigins: ['https://app.example.com'],
      allowedRedirectOrigins: ['https://app.example.com'],
      oidcIssuer: 'https://identity.example.com',
      oidcClientId: 'customer-portal',
      oidcAudience: 'linea',
      oidcJwksUrl: 'https://identity.example.com/jwks.json',
    })
    const generated = generateEnvironmentKey()
    const created = await repositories.environmentKey.createEnvironmentKey(
      db,
      {
        workspaceId: workspace,
        environmentId: environment.id,
        name: 'Rate limited key',
        scopes,
        hashedKey: generated.hashedKey,
        keyPrefix: generated.keyPrefix,
      },
      { userId: actorId },
    )
    if (created.outcome !== 'created') throw new Error(created.outcome)
    counterOwners.push(created.environmentKey.id)
    return {
      rawKey: generated.rawKey,
      keyId: created.environmentKey.id,
      workspaceId: workspace,
      environmentId: environment.id,
    }
  }
  function call(
    instance: number,
    method: 'get' | 'post',
    key: { rawKey: string; environmentId: string },
    environmentId = key.environmentId,
  ) {
    return request(instances[instance].getHttpServer())
      [method](`/environments/${environmentId}/probe`)
      .set('Authorization', `Bearer ${key.rawKey}`)
  }
  async function auditActions(keyId: string) {
    const { rows } = await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE resource_id = $1 AND action <> 'environment_key.created'",
      [keyId],
    )
    return rows.map((row) => row.action)
  }
  beforeAll(async () => {
    // Freeze Date at a minute boundary so the counter bucket cannot roll over mid-test.
    jest.useFakeTimers({
      now: Math.ceil(Date.now() / 60_000) * 60_000 + 1_000,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    })
    const [actor] = await db
      .insert(schema.users)
      .values({
        name: 'Rate limit admin',
        email: `environment-key-rate-${randomUUID()}@example.com`,
      })
      .returning()
    actorId = actor.id
    instances = [await createApp(), await createApp()]
  })
  afterAll(async () => {
    jest.useRealTimers()
    await Promise.all(instances.map((instance) => instance.close()))
    await pool.query(
      'DELETE FROM end_user_authorization_rate_limits WHERE key LIKE ANY($1::text[])',
      [counterOwners.map((owner) => `%:${owner}:%`)],
    )
    await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [
      workspaceIds,
    ])
    await pool.query('DELETE FROM users WHERE id = $1', [actorId])
    await pool.end()
  })

  it('shares one write budget across API instances, trips at the threshold and resets next window', async () => {
    const key = await createKey(['executions:start'])
    const other = await createKey(['executions:start'])
    for (let attempt = 0; attempt < 120; attempt++) {
      await call(attempt % 2, 'post', key).expect(201)
    }
    const refused = await call(0, 'post', key).expect(429)
    expect(refused.body).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests' },
    })
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
    expect(refused.headers['x-ratelimit-limit']).toBe('120')
    await call(1, 'post', key).expect(429)
    await call(0, 'get', key).expect(403)
    await call(1, 'post', other).expect(201)
    jest.setSystemTime(Date.now() + 60_000)
    await call(0, 'post', key).expect(201)
  })

  it('caps every key of a workspace with one workspace budget', async () => {
    const first = await createKey(['executions:start'])
    const keys = [first]
    for (let index = 0; index < 5; index++) {
      keys.push(await createKey(['executions:start'], first.workspaceId))
    }
    for (const key of keys.slice(0, 5)) {
      for (let attempt = 0; attempt < 120; attempt++) {
        await call(attempt % 2, 'post', key).expect(201)
      }
    }
    const refused = await call(0, 'post', keys[5]).expect(429)
    expect(refused.headers['x-ratelimit-limit']).toBe('600')
    const elsewhere = await createKey(['executions:start'])
    await call(1, 'post', elsewhere).expect(201)
  })

  it('keeps audit rows bounded under repeated use and denials', async () => {
    const key = await createKey(['executions:read'])
    for (let attempt = 0; attempt < 30; attempt++) {
      await call(attempt % 2, 'get', key).expect(200)
      await call(attempt % 2, 'post', key).expect(403)
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      await call(attempt % 2, 'get', key, randomUUID()).expect(404)
    }
    const actions = await auditActions(key.keyId)
    expect(
      actions.filter((action) => action === 'environment_key.used'),
    ).toHaveLength(1)
    expect(
      actions.filter((action) => action === 'environment_key.scope_denied'),
    ).toHaveLength(1)
    expect(
      actions.filter(
        (action) =>
          action === 'environment_key.cross_environment_access_denied',
      ),
    ).toHaveLength(20)
    jest.setSystemTime(Date.now() + 60 * 60_000)
    await call(0, 'post', key).expect(403)
    expect(
      (await auditActions(key.keyId)).filter(
        (action) => action === 'environment_key.scope_denied',
      ),
    ).toHaveLength(2)
  })
})
