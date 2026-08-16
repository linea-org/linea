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
