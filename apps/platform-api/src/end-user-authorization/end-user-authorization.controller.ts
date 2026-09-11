import { Body, Controller, Headers, Post } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  exchangeEndUserAuthorizationSchema,
  startEndUserAuthorizationSchema,
  type ExchangeEndUserAuthorization,
  type StartEndUserAuthorization,
} from '@linea/protocol/resources'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { EndUserAuthorizationService } from './end-user-authorization.service'

@Controller('user-sessions')
@OptionalAuth()
export class EndUserAuthorizationController {
  constructor(private readonly authorization: EndUserAuthorizationService) {}

  @Post('authorization')
  start(
    @Headers('origin') origin: string | undefined,
    @Body(new ZodValidationPipe(startEndUserAuthorizationSchema))
    body: StartEndUserAuthorization,
  ) {
    return this.authorization.start(body, origin)
  }

  @Post('exchange')
  exchange(
    @Headers('origin') origin: string | undefined,
    @Body(new ZodValidationPipe(exchangeEndUserAuthorizationSchema))
    body: ExchangeEndUserAuthorization,
  ) {
    return this.authorization.exchange(body, origin)
  }
}
