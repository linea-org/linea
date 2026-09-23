import { Module } from '@nestjs/common'
import { ApplicationKeyGuard } from '../auth/application-key.guard'
import { ApplicationScopeGuard } from '../auth/application-scope.guard'
import { EndUserSessionsModule } from '../end-user-sessions/end-user-sessions.module'
import { ApplicationConversationsController } from './application-conversations.controller'
import { ApplicationConnectorAuditController } from './application-connector-audit.controller'
import { ConnectorAuditService } from './connector-audit.service'
import { EndUserConnectorAuditController } from './end-user-connector-audit.controller'
import { ApplicationExecutionsController } from './application-executions.controller'
import { EndUserRuntimeController } from './end-user-runtime.controller'
import { EndUserEventStreamService } from './end-user-event-stream.service'
import { PublicRuntimeService } from './public-runtime.service'
import { WebhookDeliveriesController } from './webhook-deliveries.controller'
import { WebhookDeliveriesService } from './webhook-deliveries.service'
import { WorkspaceConnectorAuditController } from './workspace-connector-audit.controller'

@Module({
  imports: [EndUserSessionsModule],
  controllers: [
    ApplicationConversationsController,
    ApplicationConnectorAuditController,
    ApplicationExecutionsController,
    EndUserRuntimeController,
    EndUserConnectorAuditController,
    WebhookDeliveriesController,
    WorkspaceConnectorAuditController,
  ],
  providers: [
    PublicRuntimeService,
    EndUserEventStreamService,
    ApplicationKeyGuard,
    ApplicationScopeGuard,
    WebhookDeliveriesService,
    ConnectorAuditService,
  ],
})
export class PublicRuntimeModule {}
