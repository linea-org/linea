import { Module } from '@nestjs/common'
import { EndUserSessionGuard } from './end-user-session.guard'
import { EndUserSessionService } from './end-user-session.service'
import { EndUserSessionsController } from './end-user-sessions.controller'

@Module({
  controllers: [EndUserSessionsController],
  providers: [EndUserSessionService, EndUserSessionGuard],
  exports: [EndUserSessionGuard],
})
export class EndUserSessionsModule {}
