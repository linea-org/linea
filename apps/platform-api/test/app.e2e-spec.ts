import '../src/env'
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from './../src/app.module'
import { API_PREFIX } from './../src/common/api-prefix'

describe('Platform API (e2e)', () => {
  let app: INestApplication<App>

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication({
      bodyParser: false,
    })
    app.setGlobalPrefix(API_PREFIX)
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect((res) => {
        expect((res.body as { status: string }).status).toBe('ok')
      })
  })

  it('/v1/me (GET) requires auth', () => {
    return request(app.getHttpServer()).get('/v1/me').expect(401)
  })

  it('does not serve unversioned application routes', () => {
    return request(app.getHttpServer()).get('/health').expect(404)
  })
})
