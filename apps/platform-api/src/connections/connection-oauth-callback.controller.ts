import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  connectionOAuthCallbackSchema,
  connectionProviderSchema,
  type ConnectionOAuthCallback,
} from '@linea/protocol/resources'
import type { Response } from 'express'
import { PublicValidationPipe } from '../public-runtime/public-validation.pipe'
import { ConnectionsService } from './connections.service'

@Controller('user/connections/oauth')
@OptionalAuth()
export class ConnectionOAuthCallbackController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get(':provider/callback')
  async complete(
    @Param('provider', new PublicValidationPipe(connectionProviderSchema))
    provider: string,
    @Query(new PublicValidationPipe(connectionOAuthCallbackSchema))
    query: ConnectionOAuthCallback,
    @Res() response: Response,
  ) {
    response.redirect(
      302,
      await this.connections.completeAuthorization(provider, query),
    )
  }
}
