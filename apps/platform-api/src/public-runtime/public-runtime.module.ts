import { Module } from '@nestjs/common'
import { EnvironmentKeyGuard } from '../auth/environment-key.guard'
import { EnvironmentScopeGuard } from '../auth/environment-scope.guard'
import { EndUserSessionsModule } from '../end-user-sessions/end-user-sessions.module'
import { EnvironmentConversationsController } from './environment-conversations.controller'
import { EnvironmentConnectorAuditController } from './environment-connector-audit.controller'
import { ConnectorAuditService } from './connector-audit.service'
import { EndUserConnectorAuditController } from './end-user-connector-audit.controller'
import { EnvironmentExecutionsController } from './environment-executions.controller'
import { EndUserRuntimeController } from './end-user-runtime.controller'
import { EndUserEventStreamService } from './end-user-event-stream.service'
import { PublicRuntimeService } from './public-runtime.service'
import { WebhookDeliveriesController } from './webhook-deliveries.controller'
import { WebhookDeliveriesService } from './webhook-deliveries.service'
import { WorkspaceConnectorAuditController } from './workspace-connector-audit.controller'

@Module({
  imports: [EndUserSessionsModule],
  controllers: [
    EnvironmentConversationsController,
    EnvironmentConnectorAuditController,
    EnvironmentExecutionsController,
    EndUserRuntimeController,
    EndUserConnectorAuditController,
    WebhookDeliveriesController,
    WorkspaceConnectorAuditController,
  ],
  providers: [
    PublicRuntimeService,
    EndUserEventStreamService,
    EnvironmentKeyGuard,
    EnvironmentScopeGuard,
    WebhookDeliveriesService,
    ConnectorAuditService,
  ],
})
export class PublicRuntimeModule {}
