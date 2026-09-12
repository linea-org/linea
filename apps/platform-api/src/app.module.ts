import '@linea/config/env'
import { Module } from '@nestjs/common'
import { AuthModule } from '@thallesp/nestjs-better-auth'
import { auth } from '@linea/auth'
import { ApiKeysModule } from './api-keys/api-keys.module'
import { ApplicationsModule } from './applications/applications.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ApprovalsModule } from './approvals/approvals.module'
import { ConversationAnalysesModule } from './conversation-analyses/conversation-analyses.module'
import { RegressionsModule } from './regressions/regressions.module'
import { ExecutionsModule } from './executions/executions.module'
import { EndUserAuthorizationModule } from './end-user-authorization/end-user-authorization.module'
import { EndUserSessionsModule } from './end-user-sessions/end-user-sessions.module'
import { HealthController } from './health/health.controller'
import { MeController } from './me/me.controller'
import { NotificationsModule } from './notifications/notifications.module'
import { QueueModule } from './queue/queue.module'
import { SecretsModule } from './secrets/secrets.module'
import { SignalsModule } from './signals/signals.module'
import { TriggersModule } from './triggers/triggers.module'
import { WorkflowsModule } from './workflows/workflows.module'

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      isGlobal: true,
    }),
    QueueModule,
    ApiKeysModule,
    ApplicationsModule,
    EndUserAuthorizationModule,
    EndUserSessionsModule,
    WorkflowsModule,
    ExecutionsModule,
    TriggersModule,
    SignalsModule,
    SecretsModule,
    NotificationsModule,
    ApprovalsModule,
    ConversationAnalysesModule,
    RegressionsModule,
  ],
  controllers: [AppController, HealthController, MeController],
  providers: [AppService],
})
export class AppModule {}
