import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  startConnectionAuthorizationSchema,
  type StartConnectionAuthorization,
} from '@linea/protocol/resources'
import { CurrentEndUser } from '../end-user-sessions/current-end-user.decorator'
import {
  EndUserSessionGuard,
  type EndUserPrincipal,
} from '../end-user-sessions/end-user-session.guard'
import { PublicValidationPipe } from '../public-runtime/public-validation.pipe'
import { ConnectionsService } from './connections.service'

@Controller('user/connections')
@OptionalAuth()
@UseGuards(EndUserSessionGuard)
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post('authorizations')
  startAuthorization(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Body(new PublicValidationPipe(startConnectionAuthorizationSchema))
    body: StartConnectionAuthorization,
  ) {
    return this.connections.startAuthorization(principal, body)
  }

  @Get()
  list(@CurrentEndUser() principal: EndUserPrincipal) {
    return this.connections.list(principal)
  }

  @Get(':connectionId')
  get(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.connections.get(principal, connectionId)
  }

  @Delete(':connectionId')
  revoke(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.connections.revoke(principal, connectionId)
  }
}
