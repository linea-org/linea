import { Module } from '@nestjs/common'
import { EndUserAuthorizationController } from './end-user-authorization.controller'
import { EndUserAuthorizationService } from './end-user-authorization.service'
import { OIDC_PROVIDER } from './oidc-provider'
import { RemoteOidcProvider } from './remote-oidc-provider'

@Module({
  controllers: [EndUserAuthorizationController],
  providers: [
    EndUserAuthorizationService,
    RemoteOidcProvider,
    { provide: OIDC_PROVIDER, useExisting: RemoteOidcProvider },
  ],
})
export class EndUserAuthorizationModule {}
