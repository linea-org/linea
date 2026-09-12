import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  createEndUserSessionSchema,
  type CreateEndUserSession,
} from '@linea/protocol/resources'
import type { Request, Response } from 'express'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { CurrentEndUser } from './current-end-user.decorator'
import { DpopProofError, readDpopProof, requestTarget } from './dpop-proof'
import {
  EndUserSessionGuard,
  type EndUserPrincipal,
} from './end-user-session.guard'
import { EndUserSessionService } from './end-user-session.service'

@Controller('user-sessions')
@OptionalAuth()
export class EndUserSessionsController {
  constructor(private readonly sessions: EndUserSessionService) {}

  @Post()
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('origin') origin: string | undefined,
    @Ip() clientIp: string,
    @Body(new ZodValidationPipe(createEndUserSessionSchema))
    body: CreateEndUserSession,
  ) {
    let proof: string
    try {
      proof = readDpopProof(request)
    } catch (error) {
      if (error instanceof DpopProofError) proof = ''
      else throw error
    }
    const result = await this.sessions.create(
      body,
      proof,
      request.method,
      requestTarget(request),
      origin,
      clientIp,
    )
    response.setHeader('DPoP-Nonce', result.dpopNonce)
    return result
  }

  @Delete('current')
  @HttpCode(204)
  @UseGuards(EndUserSessionGuard)
  async revoke(@CurrentEndUser() principal: EndUserPrincipal): Promise<void> {
    await this.sessions.revoke(principal.sessionId)
  }
}
