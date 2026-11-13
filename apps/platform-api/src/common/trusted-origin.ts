export function getTrustedOrigins(): string[] {
  return (process.env.TRUSTED_ORIGINS ?? process.env.APP_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function isTrustedOrigin(origin: string, allowlist: string[]): boolean {
  if (allowlist.includes(origin)) return true
  try {
    const appUrl = process.env.APP_URL
    if (appUrl && origin === new URL(appUrl).origin) return true
  } catch {
    return false
  }
  return false
}

export function usesEnvironmentOriginPolicy(path: string): boolean {
  // Express routes ignore case, so this must too or a re-cased path slips past the exclusion below.
  const route = path.toLowerCase()
  // Cookie-bound OAuth pages are navigated to, never fetched; a readable body leaks the browser challenge.
  if (route.startsWith('/v1/user/connections/oauth/')) return false
  return (
    route === '/v1/user-sessions/authorization' ||
    route === '/v1/user-sessions/exchange' ||
    route === '/v1/user-sessions' ||
    route === '/v1/user-sessions/current' ||
    route.startsWith('/v1/user/')
  )
}
