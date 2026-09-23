import { Module } from '@nestjs/common'
import { EndUserSessionsModule } from '../end-user-sessions/end-user-sessions.module'
import { ConnectionOAuthCallbackController } from './connection-oauth-callback.controller'
import {
  CONNECTION_OAUTH_PROVIDERS,
  type ConnectionOAuthProvider,
} from './connection-oauth-provider'
import { ConnectionsController } from './connections.controller'
import { ConnectionsService } from './connections.service'
import { ConnectionCredentialsService } from './connection-credentials.service'
import { ConnectionRevocationService } from './connection-revocation.service'
import { googleOAuthProviderFromEnvironment } from './google-oauth-provider'
import { githubOAuthProviderFromEnvironment } from './github-oauth-provider'

function connectionOAuthProviders() {
  const google = googleOAuthProviderFromEnvironment()
  const github = githubOAuthProviderFromEnvironment()
  return [google, github].filter(
    (provider): provider is ConnectionOAuthProvider => provider != null,
  )
}

@Module({
  imports: [EndUserSessionsModule],
  controllers: [ConnectionsController, ConnectionOAuthCallbackController],
  providers: [
    ConnectionsService,
    ConnectionCredentialsService,
    ConnectionRevocationService,
    {
      provide: CONNECTION_OAUTH_PROVIDERS,
      useFactory: connectionOAuthProviders,
    },
  ],
  exports: [ConnectionCredentialsService],
})
export class ConnectionsModule {}
