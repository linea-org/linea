import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common'
import type { Response } from 'express'
import { publicError } from '../auth/public-error'

export class PublicRuntimeRateLimitException extends HttpException {
  constructor(
    readonly limit: number,
    readonly resetAt: Date,
  ) {
    super(publicError('rate_limited', 'Too many requests'), 429)
  }
}

@Catch(PublicRuntimeRateLimitException)
export class PublicRuntimeRateLimitFilter implements ExceptionFilter {
  catch(exception: PublicRuntimeRateLimitException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const retryAfter = Math.max(
      1,
      Math.ceil((exception.resetAt.getTime() - Date.now()) / 1000),
    )
    response.setHeader('Retry-After', retryAfter)
    response.setHeader('X-RateLimit-Limit', exception.limit)
    response.setHeader('X-RateLimit-Remaining', 0)
    response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(exception.resetAt.getTime() / 1000),
    )
    response.status(exception.getStatus()).json(exception.getResponse())
  }
}
