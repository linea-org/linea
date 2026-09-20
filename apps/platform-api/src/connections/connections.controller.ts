import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  startConnectionAuthorizationSchema,
  listConnectionsQuerySchema,
  listConnectionUsesQuerySchema,
  startConnectionScopeUpgradeSchema,
  type ListConnectionsQuery,
  type ListConnectionUsesQuery,
  type StartConnectionAuthorization,
  type StartConnectionScopeUpgrade,
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

  @Get('authorizations/:authorizationId')
  getAuthorization(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('authorizationId', ParseUUIDPipe) authorizationId: string,
  ) {
    return this.connections.getAuthorization(principal, authorizationId)
  }

  @Get()
  list(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Query(new PublicValidationPipe(listConnectionsQuerySchema))
    query: ListConnectionsQuery,
  ) {
    return this.connections.list(principal, query)
  }

  @Post(':connectionId/authorizations')
  startScopeUpgrade(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body(new PublicValidationPipe(startConnectionScopeUpgradeSchema))
    body: StartConnectionScopeUpgrade,
  ) {
    return this.connections.startScopeUpgrade(principal, connectionId, body)
  }

  @Get(':connectionId/uses')
  listUses(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query(new PublicValidationPipe(listConnectionUsesQuerySchema))
    query: ListConnectionUsesQuery,
  ) {
    return this.connections.listUses(principal, connectionId, query)
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
