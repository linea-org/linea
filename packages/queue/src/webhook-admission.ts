import { createHash, randomUUID } from "node:crypto"
import { DelayedError, type Job } from "bullmq"
import type { Redis } from "ioredis"

export const WEBHOOK_ADMISSION_LEASE_MS = 60_000
export const WEBHOOK_WORKSPACE_CONCURRENCY = 4
const ADMISSION_DELAY_MS = 1_000

const acquireScript = `
local clock = redis.call('TIME')
local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
for i, key in ipairs(KEYS) do
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
  if redis.call('ZCARD', key) >= tonumber(ARGV[i + 2]) then return 0 end
end
for _, key in ipairs(KEYS) do
  redis.call('ZADD', key, now + tonumber(ARGV[2]), ARGV[1])
  redis.call('PEXPIRE', key, ARGV[2])
end
return 1
`

export async function withWebhookAdmission<T>(
  connection: Redis,
  job: Job<T>,
  token: string | undefined,
  scope: { workspaceId: string; webhookId: string; url: string },
  process: (signal: AbortSignal) => Promise<void>
): Promise<void> {
  const origin = createHash("sha256")
    .update(new URL(scope.url).origin)
    .digest("hex")
  const prefix = `webhook-admission:{${scope.workspaceId}}`
  const keys = [
    prefix,
    `${prefix}:endpoint:${scope.webhookId}`,
    `${prefix}:origin:${origin}`,
  ]
  const lease = randomUUID()
  const startedAt = Date.now()
  const admitted = await connection.eval(
    acquireScript,
    keys.length,
    ...keys,
    lease,
    WEBHOOK_ADMISSION_LEASE_MS,
    WEBHOOK_WORKSPACE_CONCURRENCY,
    1,
    1
  )
  if (admitted !== 1) {
    await job.moveToDelayed(Date.now() + ADMISSION_DELAY_MS, token)
    throw new DelayedError()
  }
  // Abort before lease expiry even if a DB operation delayed starting the request.
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error("Webhook admission lease expired")),
    Math.max(0, WEBHOOK_ADMISSION_LEASE_MS - 5_000 - (Date.now() - startedAt))
  )
  timer.unref()
  try {
    await process(controller.signal)
  } finally {
    clearTimeout(timer)
    await connection.eval(
      `for _, key in ipairs(KEYS) do redis.call('ZREM', key, ARGV[1]) end return 1`,
      keys.length,
      ...keys,
      lease
    )
  }
}
