import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common'
import { idempotencyKeySchema } from '@linea/protocol/shared'
import type { Request } from 'express'
import { publicError } from '../auth/public-error'

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>()
    const result = idempotencyKeySchema.safeParse(
      request.headers['idempotency-key'],
    )
    if (!result.success) {
      throw new BadRequestException(
        publicError('validation_failed', 'Idempotency-Key header is invalid'),
      )
    }
    return result.data
  },
)
