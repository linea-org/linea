import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { ExpressAdapter } from '@nestjs/platform-express'
import request from 'supertest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { toNodeHandler } from 'better-auth/node'
import { Redis } from 'ioredis'
import { configureAuthClientIp } from '../src/common/auth-client-ip.ts'

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/ip_test'
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.BETTER_AUTH_SECRET = 'auth-client-ip-regression-test-secret'

const { auth, createAuthRateLimiter } = await import('@linea/auth')
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 })
after(() => redis.quit())

function createApp(trustedProxies) {
  const app = new ExpressAdapter().getInstance()
  configureAuthClientIp(app, trustedProxies)
  const limiter = createAuthRateLimiter(
    redis,
    `auth-client-ip-test:${randomUUID()}`,
  )
  const isolatedAuth = betterAuth({
    ...auth.options,
    rateLimit: { ...auth.options.rateLimit, customStorage: limiter.storage },
    hooks: limiter.hooks,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
  })
  app.get('/ip', (req, res) => {
    res.json({
      real: req.headers['x-real-ip'],
      forwarded: req.headers['x-forwarded-for'],
    })
  })
  app.all('/v1/auth/*path', toNodeHandler(isolatedAuth))
  return app
}

async function signIn(app, spoofed, forwarded) {
  return request(app)
    .post('/v1/auth/sign-in/email')
    .set('x-real-ip', spoofed)
    .set('x-forwarded-for', forwarded)
    .set('forwarded', `for=${spoofed}`)
    .set('cf-connecting-ip', spoofed)
    .send({ email: 'invalid' })
}

test('direct access ignores rotating attacker IP headers and still throttles', async () => {
  const app = createApp(undefined)
  const ip = await request(app)
    .get('/ip')
    .set('x-real-ip', '192.0.2.1')
    .set('x-forwarded-for', '192.0.2.2')
  assert.deepEqual(ip.body, { real: '127.0.0.1', forwarded: '127.0.0.1' })
  const statuses = []
  for (let i = 1; i <= 4; i++) {
    statuses.push((await signIn(app, `192.0.2.${i}`, `198.51.100.${i}`)).status)
  }
  assert.deepEqual(statuses, [400, 400, 400, 429])
})

test('an untrusted peer cannot use forwarded headers even when other proxies are trusted', async () => {
  const app = createApp('10.0.0.0/8')
  const ip = await request(app).get('/ip').set('x-forwarded-for', '192.0.2.3')
  assert.deepEqual(ip.body, { real: '127.0.0.1', forwarded: '127.0.0.1' })
})

test('trusted proxy clients stay distinct while spoofed leftmost hops cannot rotate buckets', async () => {
  const app = createApp('127.0.0.1/32, ::1/128, 10.0.0.0/8')
  for (let i = 1; i <= 4; i++) {
    const result = await signIn(
      app,
      `192.0.2.${i}`,
      `192.0.2.${i}, 198.51.100.10, 10.1.1.1`,
    )
    assert.equal(result.status, i === 4 ? 429 : 400)
  }
  const secondClient = await signIn(
    app,
    '192.0.2.99',
    '198.51.100.11, 10.1.1.1',
  )
  assert.equal(secondClient.status, 400)
  const ip = await request(app)
    .get('/ip')
    .set('x-real-ip', '192.0.2.99')
    .set('x-forwarded-for', '192.0.2.99, 198.51.100.11, 10.1.1.1')
  assert.deepEqual(ip.body, {
    real: '198.51.100.11',
    forwarded: '198.51.100.11',
  })
})

test('invalid proxy policy fails at startup and malformed forwarded addresses fail closed', async () => {
  for (const policy of [
    '1',
    'true',
    'loopback',
    '10.0.0.0/33',
    '::1/129',
    '10.0.0.1/',
  ]) {
    assert.throws(() => createApp(policy))
  }
  const app = createApp('127.0.0.1/32, ::1/128')
  const result = await request(app).get('/ip').set('x-forwarded-for', 'invalid')
  assert.equal(result.status, 500)
})
