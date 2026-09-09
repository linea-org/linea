import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types'
import { AppController } from '../app.controller'
import { AppService } from '../app.service'
import { HealthController } from '../health/health.controller'
import { API_PREFIX } from './api-prefix'

describe('API prefix', () => {
  let app: INestApplication<App>
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController, HealthController],
      providers: [AppService],
    }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix(API_PREFIX)
    await app.init()
  })
  afterAll(async () => {
    await app.close()
  })
  it('serves controllers only through /v1', async () => {
    await request(app.getHttpServer()).get('/v1').expect(200)
    await request(app.getHttpServer()).get('/v1/health').expect(200)
    await request(app.getHttpServer()).get('/').expect(404)
    await request(app.getHttpServer()).get('/health').expect(404)
  })
})
