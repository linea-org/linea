import type { ConnectionProviderCredential } from './connection-oauth-provider'

export function parseConnectionProviderCredential(
  value: string,
): ConnectionProviderCredential {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Stored provider credential is invalid')
  }
  if (!('accountId' in parsed) || typeof parsed.accountId !== 'string') {
    throw new Error('Stored provider credential is invalid')
  }
  if (!('accountLabel' in parsed) || typeof parsed.accountLabel !== 'string') {
    throw new Error('Stored provider credential is invalid')
  }
  if (!('accessToken' in parsed) || typeof parsed.accessToken !== 'string') {
    throw new Error('Stored provider credential is invalid')
  }
  if (
    !('refreshToken' in parsed) ||
    (parsed.refreshToken !== null && typeof parsed.refreshToken !== 'string')
  ) {
    throw new Error('Stored provider credential is invalid')
  }
  if (
    !('expiresAt' in parsed) ||
    (parsed.expiresAt !== null && typeof parsed.expiresAt !== 'string')
  ) {
    throw new Error('Stored provider credential is invalid')
  }
  if (
    !('grantedScopes' in parsed) ||
    !Array.isArray(parsed.grantedScopes) ||
    !parsed.grantedScopes.every((scope) => typeof scope === 'string')
  ) {
    throw new Error('Stored provider credential is invalid')
  }
  return {
    accountId: parsed.accountId,
    accountLabel: parsed.accountLabel,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    grantedScopes: parsed.grantedScopes,
  }
}
