import { createLocalJWKSet, errors, type JWTVerifyGetKey } from 'jose-v5'
import { z } from 'zod'
import {
  type OidcEnvironmentConfiguration,
  OidcProviderUnavailableError,
} from './oidc-provider'
import { requestOidc } from './oidc-request'

const jwksSchema = z.object({
  keys: z.array(z.looseObject({ kty: z.string() })),
})

export function createOidcJwks(
  configuration: OidcEnvironmentConfiguration,
): JWTVerifyGetKey {
  let local: ReturnType<typeof createLocalJWKSet> | undefined
  let expiresAt = 0
  let pending: Promise<void> | undefined
  async function reload(): Promise<void> {
    pending ??= (async () => {
      const response = await requestOidc(
        configuration,
        configuration.jwksUrl,
        undefined,
        256 * 1024,
      )
      if (response.status !== 200) throw new OidcProviderUnavailableError()
      local = createLocalJWKSet(jwksSchema.parse(await response.json()))
      expiresAt = Date.now() + 300_000
    })().finally(() => {
      pending = undefined
    })
    await pending
  }
  return async (header, token) => {
    if (!local || expiresAt <= Date.now()) await reload()
    if (!local) throw new OidcProviderUnavailableError()
    try {
      return await local(header, token)
    } catch (error) {
      if (!(error instanceof errors.JWKSNoMatchingKey)) throw error
      await reload()
      return local(header, token)
    }
  }
}
