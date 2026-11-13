import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Controller, Post, UseGuards } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import type { NextFunction, Response } from 'express'
import request from 'supertest'
import { db, pool, repositories, schema } from '@linea/db'
import { PublicRuntimeRateLimitFilter } from '../public-runtime/public-runtime-rate-limit.filter'
import { generateApiKey } from './api-key.util'
import { RequireWorkspaceKeyScopes } from './require-workspace-key-scopes.decorator'
import {
  WorkspaceAuthGuard,
  type AuthenticatedRequest,
} from './workspace-auth.guard'
import {
  WORKSPACE_RATE_LIMITS,
  WorkspaceRateLimit,
} from './workspace-rate-limit.guard'

@Controller('probe')
@UseGuards(WorkspaceAuthGuard)
class WorkspaceProbeController {
  @Post('start')
  @RequireWorkspaceKeyScopes('executions:start')
  @WorkspaceRateLimit('start')
  start() {
    return { ok: true }
  }

  @Post('diagnostic')
  @RequireWorkspaceKeyScopes('executions:start')
  @WorkspaceRateLimit('diagnostic')
  diagnostic() {
    return { ok: true }
  }
}

async function createApp() {
  const module = await Test.createTestingModule({
    controllers: [WorkspaceProbeController],
  }).compile()
  const app = module.createNestApplication<NestExpressApplication<Server>>()
  // Stands in for the Better Auth session middleware.
  app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const userId = req.headers['x-test-user']
    const workspaceId = req.headers['x-test-workspace']
    if (typeof userId === 'string' && typeof workspaceId === 'string') {
      req.session = {
        session: { activeOrganizationId: workspaceId },
        user: { id: userId },
      }
    }
    next()
  })
  app.useGlobalFilters(new PublicRuntimeRateLimitFilter())
  await app.init()
  return app
}

describe('Workspace start rate limits (Postgres)', () => {
  const workspaceIds: string[] = []
  const userIds: string[] = []
  const counterOwners: string[] = []
  let instances: NestExpressApplication<Server>[]
  async function createWorkspace() {
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workspace rate limits',
        slug: `workspace-rate-${randomUUID()}`,
        createdAt: new Date(),
      })
      .returning()
    workspaceIds.push(organization.id)
    counterOwners.push(organization.id)
    return organization.id
  }
  async function createApiKey(workspaceId: string) {
    const generated = generateApiKey()
    await repositories.apiKey.createApiKey(db, {
      workspaceId,
      name: 'Rate limited API key',
      scopes: ['executions:start'],
      hashedKey: generated.hashedKey,
      keyPrefix: generated.keyPrefix,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdByUserId: await createMember(workspaceId, 'admin'),
    })
    counterOwners.push(generated.hashedKey)
    return generated.rawKey
  }
  async function createMember(workspaceId: string, role = 'member') {
    const [user] = await db
      .insert(schema.users)
      .values({
        name: 'Rate limited member',
        email: `workspace-rate-${randomUUID()}@example.com`,
      })
      .returning()
    userIds.push(user.id)
    counterOwners.push(user.id)
    await db.insert(schema.members).values({
      organizationId: workspaceId,
      userId: user.id,
      role,
      createdAt: new Date(),
    })
    return user.id
  }
  function withKey(instance: number, route: string, rawKey: string) {
    return request(instances[instance].getHttpServer())
      .post(`/probe/${route}`)
      .set('Authorization', `Bearer ${rawKey}`)
  }
  function asMember(
    instance: number,
    route: string,
    workspaceId: string,
    userId: string,
  ) {
    return request(instances[instance].getHttpServer())
      .post(`/probe/${route}`)
      .set('x-test-workspace', workspaceId)
      .set('x-test-user', userId)
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
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
    await pool.end()
  })

  it('limits one API key across instances and resets after the window', async () => {
    const workspaceId = await createWorkspace()
    const rawKey = await createApiKey(workspaceId)
    const otherKey = await createApiKey(await createWorkspace())
    const limit = WORKSPACE_RATE_LIMITS.diagnostic.actor
    for (let attempt = 0; attempt < limit; attempt++) {
      await withKey(attempt % 2, 'diagnostic', rawKey).expect(201)
    }
    const refused = await withKey(1, 'diagnostic', rawKey).expect(429)
    expect(refused.body).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests' },
    })
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
    expect(refused.headers['x-ratelimit-limit']).toBe(String(limit))
    await withKey(0, 'start', rawKey).expect(201)
    await withKey(0, 'diagnostic', otherKey).expect(201)
    jest.setSystemTime(Date.now() + 60_000)
    await withKey(1, 'diagnostic', rawKey).expect(201)
  })

  it('gives each member an own budget under one workspace budget', async () => {
    const workspaceId = await createWorkspace()
    const limits = WORKSPACE_RATE_LIMITS.diagnostic
    const members: string[] = []
    for (let index = 0; index <= limits.workspace / limits.actor; index++) {
      members.push(await createMember(workspaceId))
    }
    for (const userId of members.slice(0, -1)) {
      for (let attempt = 0; attempt < limits.actor; attempt++) {
        await asMember(attempt % 2, 'diagnostic', workspaceId, userId).expect(
          201,
        )
      }
      await asMember(0, 'diagnostic', workspaceId, userId).expect(429)
    }
    const refused = await asMember(
      1,
      'diagnostic',
      workspaceId,
      members[members.length - 1],
    ).expect(429)
    expect(refused.headers['x-ratelimit-limit']).toBe(String(limits.workspace))
    const elsewhere = await createWorkspace()
    await asMember(
      0,
      'diagnostic',
      elsewhere,
      await createMember(elsewhere),
    ).expect(201)
  })
})
