import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common'
import { eventIdSchema } from '@linea/protocol/shared'
import type { Request } from 'express'
import { publicError } from '../auth/public-error'

export const LastEventId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>()
    const value = request.headers['last-event-id']
    if (value === undefined) return undefined
    const result = eventIdSchema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException(
        publicError('validation_failed', 'Last-Event-ID header is invalid'),
      )
    }
    return result.data
  },
)
