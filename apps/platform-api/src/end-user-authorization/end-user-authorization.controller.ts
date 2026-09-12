import { Body, Controller, Headers, Ip, Post, Res } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  exchangeEndUserAuthorizationSchema,
  startEndUserAuthorizationSchema,
  type ExchangeEndUserAuthorization,
  type StartEndUserAuthorization,
} from '@linea/protocol/resources'
import type { Response } from 'express'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { EndUserAuthorizationService } from './end-user-authorization.service'

@Controller('user-sessions')
@OptionalAuth()
export class EndUserAuthorizationController {
  constructor(private readonly authorization: EndUserAuthorizationService) {}

  @Post('authorization')
  start(
    @Headers('origin') origin: string | undefined,
    @Ip() clientIp: string,
    @Body(new ZodValidationPipe(startEndUserAuthorizationSchema))
    body: StartEndUserAuthorization,
  ) {
    return this.authorization.start(body, origin, clientIp)
  }

  @Post('exchange')
  async exchange(
    @Headers('origin') origin: string | undefined,
    @Ip() clientIp: string,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(exchangeEndUserAuthorizationSchema))
    body: ExchangeEndUserAuthorization,
  ) {
    const result = await this.authorization.exchange(body, origin, clientIp)
    response.setHeader('DPoP-Nonce', result.dpopNonce)
    return result
  }
}
