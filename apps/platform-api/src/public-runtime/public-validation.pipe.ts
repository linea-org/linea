import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { publicError } from '../auth/public-error'

export class PublicValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException(
        publicError('validation_failed', 'Request validation failed'),
      )
    }
    return result.data
  }
}
