import { isIP } from 'node:net'
import type { RequestHandler } from 'express'

type HttpAdapter = {
  set: (name: string, value: unknown) => unknown
  use: (handler: RequestHandler) => unknown
}

export function configureAuthClientIp(
  app: HttpAdapter,
  trustedProxies: string | undefined,
) {
  const proxies = trustedProxies
    ?.split(',')
    .map((proxy) => proxy.trim())
    .filter(Boolean)
  for (const proxy of proxies ?? []) {
    const [address = '', prefix, ...extra] = proxy.split('/')
    const version = isIP(address)
    if (
      !version ||
      extra.length > 0 ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)))
    ) {
      throw new Error(
        `TRUSTED_PROXIES requires IP addresses or CIDRs: ${proxy}`,
      )
    }
  }
  app.set('trust proxy', proxies?.length ? proxies : false)
  const overwriteClientIp: RequestHandler = (req, _res, next) => {
    const resolvedIp = req.ip
    if (!resolvedIp || !isIP(resolvedIp)) {
      throw new Error('Cannot resolve a valid auth client IP')
    }
    const ip =
      resolvedIp.startsWith('::ffff:') && isIP(resolvedIp.slice(7)) === 4
        ? resolvedIp.slice('::ffff:'.length)
        : resolvedIp
    req.headers['x-real-ip'] = ip
    req.headers['x-forwarded-for'] = ip
    next()
  }
  app.use(overwriteClientIp)
}
