import { Module } from '@nestjs/common'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { EndUserSessionsModule } from '../end-user-sessions/end-user-sessions.module'
import { ApplicationConversationsController } from './application-conversations.controller'
import { ApplicationExecutionsController } from './application-executions.controller'
import { EndUserRuntimeController } from './end-user-runtime.controller'
import { EndUserEventStreamService } from './end-user-event-stream.service'
import { PublicRuntimeService } from './public-runtime.service'
import { WebhookDeliveriesController } from './webhook-deliveries.controller'
import { WebhookDeliveriesService } from './webhook-deliveries.service'

@Module({
  imports: [EndUserSessionsModule],
  controllers: [
    ApplicationConversationsController,
    ApplicationExecutionsController,
    EndUserRuntimeController,
    WebhookDeliveriesController,
  ],
  providers: [
    PublicRuntimeService,
    EndUserEventStreamService,
    ApplicationKeyGuard,
    ApplicationScopeGuard,
    WebhookDeliveriesService,
  ],
})
export class PublicRuntimeModule {}
