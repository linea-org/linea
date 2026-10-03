import { SetMetadata } from '@nestjs/common'
import type { EnvironmentKeyScope } from '@linea/protocol/resources'

export const ENVIRONMENT_SCOPES_KEY = 'environment_scopes'

export const RequireEnvironmentScopes = (...scopes: EnvironmentKeyScope[]) =>
  SetMetadata(ENVIRONMENT_SCOPES_KEY, scopes)
