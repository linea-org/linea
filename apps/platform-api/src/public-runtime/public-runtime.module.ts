import { Module } from '@nestjs/common'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { EndUserSessionsModule } from '../end-user-sessions/end-user-sessions.module'
import { ApplicationConversationsController } from './application-conversations.controller'
import { ApplicationExecutionsController } from './application-executions.controller'
import { EndUserRuntimeController } from './end-user-runtime.controller'
import { EndUserEventStreamService } from './end-user-event-stream.service'
import { PublicRuntimeService } from './public-runtime.service'

@Module({
  imports: [EndUserSessionsModule],
  controllers: [
    ApplicationConversationsController,
    ApplicationExecutionsController,
    EndUserRuntimeController,
  ],
  providers: [
    PublicRuntimeService,
    EndUserEventStreamService,
    ApplicationKeyGuard,
    ApplicationScopeGuard,
  ],
})
export class PublicRuntimeModule {}
