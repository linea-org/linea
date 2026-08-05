import { SetMetadata, createParamDecorator } from '@nestjs/common'

export const AllowAnonymous = () => SetMetadata('ALLOW_ANONYMOUS', true)

export const OptionalAuth = () => SetMetadata('OPTIONAL', true)

export const RequireActiveOrg = () => SetMetadata('REQUIRE_ACTIVE_ORG', true)

export const Session = createParamDecorator(() => undefined)

export class AuthModule {
  static forRoot() {
    return {
      module: AuthModule,
      global: true,
      providers: [],
      exports: [],
    }
  }
}
