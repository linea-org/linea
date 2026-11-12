import { z } from 'zod'
import {
  readBrowserProof,
  sendBrowserLaunch,
} from './connection-browser-launch'
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  connectionOAuthCallbackSchema,
  connectionProviderSchema,
  type ConnectionOAuthCallback,
} from '@linea/protocol/resources'
import type { Request, Response } from 'express'
import { PublicValidationPipe } from '../public-runtime/public-validation.pipe'
import { ConnectionsService } from './connections.service'

@Controller('user/connections/oauth')
@OptionalAuth()
export class ConnectionOAuthCallbackController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get(':provider/launch')
  async launch(
    @Query(
      new PublicValidationPipe(
        z.strictObject({ state: z.string().min(1).max(2000) }),
      ),
    )
    query: { state: string },
    @Res() response: Response,
  ) {
    const pending = await this.connections.browserLaunch(query.state)
    sendBrowserLaunch(response, {
      state: query.state,
      returnUri: pending.returnUri,
      authorizationId: pending.id,
      secure: this.secureCookies(),
    })
  }

  private secureCookies(): boolean {
    const baseUrl = process.env.CONNECTION_OAUTH_CALLBACK_BASE_URL
    if (!baseUrl)
      throw new Error('CONNECTION_OAUTH_CALLBACK_BASE_URL is required')
    return new URL(baseUrl).protocol === 'https:'
  }

  @Get(':provider/callback')
  async complete(
    @Param('provider', new PublicValidationPipe(connectionProviderSchema))
    provider: string,
    @Query(new PublicValidationPipe(connectionOAuthCallbackSchema))
    query: ConnectionOAuthCallback,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    })
    response.redirect(
      302,
      await this.connections.completeAuthorization(
        provider,
        query,
        readBrowserProof(request, query.state, this.secureCookies()),
      ),
    )
  }
}
