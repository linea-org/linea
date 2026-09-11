import { SetMetadata } from '@nestjs/common'
import type { ApplicationKeyScope } from '@linea/protocol/resources'

export const APPLICATION_SCOPES_KEY = 'application_scopes'

export const RequireApplicationScopes = (...scopes: ApplicationKeyScope[]) =>
  SetMetadata(APPLICATION_SCOPES_KEY, scopes)
