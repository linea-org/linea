import { test } from 'node:test'
import { Body, Controller, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AuthModule } from '@thallesp/nestjs-better-auth'
import request from 'supertest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { REQUEST_BODY_LIMITS } from '../src/common/request-body-limits.ts'

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/body_limit_test'
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.BETTER_AUTH_SECRET = 'request-body-limit-regression-test-secret'

const { auth } = await import('@linea/auth')

class EchoController {
  echo(body) {
    return { length: body.value.length }
  }
}
Body()(EchoController.prototype, 'echo', 0)
Post()(
  EchoController.prototype,
  'echo',
  Object.getOwnPropertyDescriptor(EchoController.prototype, 'echo'),
)
Controller('echo')(EchoController)

async function createApp() {
  const module = await Test.createTestingModule({
    imports: [
      AuthModule.forRoot({
        auth: betterAuth({
          ...auth.options,
          database: memoryAdapter({
            user: [],
            session: [],
            account: [],
            verification: [],
          }),
        }),
        bodyParser: REQUEST_BODY_LIMITS,
        disableGlobalAuthGuard: true,
      }),
    ],
    controllers: [EchoController],
  }).compile()
  const app = module.createNestApplication({ bodyParser: false, logger: false })
  await app.init()
  return app
}

test('the explicit body limits replace the 100 KB library default', async () => {
  const app = await createApp()
  try {
    const server = app.getHttpServer()
    await request(server)
      .post('/echo')
      .send({ value: 'a'.repeat(110 * 1024) })
      .expect(201)
    await request(server)
      .post('/echo')
      .send({ value: 'a'.repeat(200 * 1024) })
      .expect(413)
    await request(server)
      .post('/echo')
      .type('form')
      .send(`value=${'a'.repeat(32 * 1024)}`)
      .expect(413)
  } finally {
    await app.close()
  }
})
