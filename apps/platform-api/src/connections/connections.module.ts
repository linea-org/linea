import { Module } from '@nestjs/common'
import { EndUserSessionsModule } from '../end-user-sessions/end-user-sessions.module'
import { ConnectionOAuthCallbackController } from './connection-oauth-callback.controller'
import { CONNECTION_OAUTH_PROVIDERS } from './connection-oauth-provider'
import { ConnectionsController } from './connections.controller'
import { ConnectionsService } from './connections.service'
import { ConnectionCredentialsService } from './connection-credentials.service'
import { ConnectionRevocationService } from './connection-revocation.service'
import { googleOAuthProviderFromEnvironment } from './google-oauth-provider'

@Module({
  imports: [EndUserSessionsModule],
  controllers: [ConnectionsController, ConnectionOAuthCallbackController],
  providers: [
    ConnectionsService,
    ConnectionCredentialsService,
    ConnectionRevocationService,
    {
      provide: CONNECTION_OAUTH_PROVIDERS,
      useFactory: () => {
        const google = googleOAuthProviderFromEnvironment()
        return google ? [google] : []
      },
    },
  ],
  exports: [ConnectionCredentialsService],
})
export class ConnectionsModule {}
