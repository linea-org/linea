import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
  UseFilters,
} from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { publicRuntimeIdSchema } from '@linea/protocol/resources'
import request from 'supertest'
import type { App } from 'supertest/types'
import {
  PublicRuntimeRateLimitException,
  PublicRuntimeRateLimitFilter,
} from './public-runtime-rate-limit.filter'
import {
  decodeConversationCursor,
  decodeMessageCursor,
  encodeConversationCursor,
  encodeMessageCursor,
} from './public-pagination'
import { PublicValidationPipe } from './public-validation.pipe'

@Controller('limited')
@UseFilters(PublicRuntimeRateLimitFilter)
class RateLimitedController {
  @Get()
  get() {
    throw new PublicRuntimeRateLimitException(10, new Date(Date.now() + 60_000))
  }
}

describe('public runtime boundaries', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RateLimitedController],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns a stable validation error without Zod internals', () => {
    const pipe = new PublicValidationPipe(publicRuntimeIdSchema)
    try {
      pipe.transform('not-a-uuid')
      throw new Error('Validation unexpectedly succeeded')
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error
      expect(error.getResponse()).toEqual({
        error: {
          code: 'validation_failed',
          message: 'Request validation failed',
        },
      })
    }
  })

  it('returns retry metadata with the stable rate-limit error', async () => {
    const response = await request(app.getHttpServer()).get('/limited')
    expect(response.status).toBe(429)
    expect(response.headers['retry-after']).toBeDefined()
    expect(response.headers['x-ratelimit-limit']).toBe('10')
    expect(response.headers['x-ratelimit-remaining']).toBe('0')
    expect(response.headers['x-ratelimit-reset']).toBeDefined()
    expect(response.body).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests' },
    })
  })

  it('round-trips opaque pagination cursors and rejects malformed cursors', () => {
    const conversationCursor = {
      lastActivityAt: new Date('2026-09-14T01:02:03.000Z'),
      id: '0f98cdde-4914-47d2-a8e4-66acc3859b91',
    }
    expect(
      decodeConversationCursor(encodeConversationCursor(conversationCursor)),
    ).toEqual(conversationCursor)
    expect(decodeMessageCursor(encodeMessageCursor(42))).toBe(42)
    expect(() => decodeMessageCursor('not-json')).toThrow(BadRequestException)
  })
})
