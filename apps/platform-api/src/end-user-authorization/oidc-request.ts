import { requestPublic } from '@linea/http'
import {
  OidcProviderUnavailableError,
  type OidcEnvironmentConfiguration,
} from './oidc-provider'

export function allowLocalOidc(
  configuration: OidcEnvironmentConfiguration,
): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    configuration.environment === 'dev'
  )
}

export async function requestOidc(
  configuration: OidcEnvironmentConfiguration,
  url: string | URL,
  body: URLSearchParams | undefined,
  maxResponseBytes: number,
): Promise<Response> {
  try {
    const response = await requestPublic(url, {
      method: body ? 'POST' : 'GET',
      headers: body
        ? {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          }
        : { accept: 'application/json' },
      body: body?.toString(),
      signal: undefined,
      timeoutMs: 5_000,
      maxResponseBytes,
      allowLocalDevelopment: allowLocalOidc(configuration),
      requireHttps: true,
      redirectMode: 'error',
    })
    if (response.status >= 300 && response.status < 400)
      throw new OidcProviderUnavailableError()
    return response
  } catch {
    throw new OidcProviderUnavailableError()
  }
}
