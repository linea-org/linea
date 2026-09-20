import type { ConnectionProviderCredential } from './connection-oauth-provider'

function parseScopes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Stored provider credential is invalid')
  }
  const scopes: string[] = []
  for (const value_ of value) {
    const scope: unknown = value_
    if (typeof scope !== 'string') {
      throw new Error('Stored provider credential is invalid')
    }
    scopes.push(scope)
  }
  return scopes
}

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
  if (!('grantedScopes' in parsed)) {
    throw new Error('Stored provider credential is invalid')
  }
  return {
    accountId: parsed.accountId,
    accountLabel: parsed.accountLabel,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    grantedScopes: parseScopes(parsed.grantedScopes),
  }
}
