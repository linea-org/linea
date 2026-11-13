import { db, repositories } from '@linea/db'
import { PublicRuntimeRateLimitException } from '../public-runtime/public-runtime-rate-limit.filter'

const RATE_LIMIT_WINDOW_MS = 60 * 1000

/** `scope` is stored verbatim as the counter key, so it must not contain secrets or personal data. */
export type RequestRateLimit = { scope: string; limit: number }

/** Counts one request against every per-minute budget in Postgres, so the limit holds across API instances; a refused request consumes no budget. */
export async function enforceRequestRateLimits(
  limits: RequestRateLimit[],
): Promise<void> {
  const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)
  const keyed = limits.map(({ scope, limit }) => ({
    key: `${scope}:${bucket}`,
    limit,
  }))
  const exhausted = await repositories.endUserAuthorization.consumeRateLimits(
    db,
    keyed,
    new Date((bucket + 2) * RATE_LIMIT_WINDOW_MS),
  )
  if (exhausted.length === 0) return
  throw new PublicRuntimeRateLimitException(
    Math.min(
      ...keyed
        .filter(({ key }) => exhausted.includes(key))
        .map(({ limit }) => limit),
    ),
    new Date((bucket + 1) * RATE_LIMIT_WINDOW_MS),
  )
}
