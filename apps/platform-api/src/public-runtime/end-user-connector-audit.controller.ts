import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import {
  paginationQuerySchema,
  type PaginationQuery,
} from '@linea/protocol/shared'
import { CurrentEndUser } from '../end-user-sessions/current-end-user.decorator'
import {
  EndUserSessionGuard,
  type EndUserPrincipal,
} from '../end-user-sessions/end-user-session.guard'
import { ConnectorAuditService } from './connector-audit.service'
import { PublicValidationPipe } from './public-validation.pipe'

@Controller('user/audit-events')
@OptionalAuth()
@UseGuards(EndUserSessionGuard)
export class EndUserConnectorAuditController {
  constructor(private readonly audit: ConnectorAuditService) {}

  @Get()
  list(
    @CurrentEndUser() principal: EndUserPrincipal,
    @Query(new PublicValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.audit.listEndUser(principal, query)
  }
}
