import { randomUUID } from "node:crypto"
import { DelayedError, type Job } from "bullmq"
import type { Redis } from "ioredis"

export const EXECUTION_ADMISSION_LEASE_MS = 30_000
export const EXECUTION_WORKSPACE_CONCURRENCY = 4
const ADMISSION_RENEW_MS = 10_000
const ADMISSION_DELAY_MS = 2_000

const acquireScript = `
local clock = redis.call('TIME')
local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`

// Unconditional ZADD re-counts a slot that expired during a long event-loop stall instead of leaving the run uncounted.
const renewScript = `
local clock = redis.call('TIME')
local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`

export function executionAdmissionKey(workspaceId: string): string {
  return `execution-admission:{${workspaceId}}`
}

/** Bounds one workspace's in-flight executions across every worker; over the cap the job is re-delayed without spending an attempt. The slot is renewed while `run` runs and expires on its own if the worker dies. */
export async function withExecutionAdmission<T>(
  connection: Redis,
  job: Job<T>,
  token: string | undefined,
  workspaceId: string,
  run: () => Promise<void>
): Promise<void> {
  const key = executionAdmissionKey(workspaceId)
  const lease = randomUUID()
  const admitted = await connection.eval(
    acquireScript,
    1,
    key,
    lease,
    EXECUTION_ADMISSION_LEASE_MS,
    EXECUTION_WORKSPACE_CONCURRENCY
  )
  if (admitted !== 1) {
    await job.moveToDelayed(Date.now() + ADMISSION_DELAY_MS, token)
    throw new DelayedError()
  }
  const renewal = setInterval(() => {
    connection
      .eval(renewScript, 1, key, lease, EXECUTION_ADMISSION_LEASE_MS)
      .catch((error: unknown) =>
        process.emitWarning(
          error instanceof Error ? error : String(error),
          "ExecutionAdmissionRenewFailed"
        )
      )
  }, ADMISSION_RENEW_MS)
  renewal.unref()
  try {
    await run()
  } finally {
    clearInterval(renewal)
    await connection.zrem(key, lease)
  }
}
