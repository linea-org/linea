import { LineaTimeoutError } from "./http/errors.js"

const finishedStatuses = new Set(["succeeded", "failed", "cancelled"])

export type WaitOptions = {
  /** Milliseconds between polls. Defaults to 1000. */
  intervalMs?: number
  /** Milliseconds before giving up with `LineaTimeoutError`. Defaults to 300000. */
  timeoutMs?: number
}

/** Polls until the status is succeeded, failed or cancelled; a paused execution keeps waiting.
 * A read still pending at the deadline is abandoned, not aborted. */
export function waitUntilFinished<T>(
  executionId: string,
  read: () => Promise<T>,
  status: (value: T) => string,
  options: WaitOptions
): Promise<T> {
  const intervalMs = options.intervalMs ?? 1000
  const deadline = Date.now() + (options.timeoutMs ?? 300_000)
  const poll = async (lastStatus?: string): Promise<T> => {
    const value = await beforeDeadline(
      read(),
      deadline,
      () => new LineaTimeoutError({ executionId, status: lastStatus })
    )
    const current = status(value)
    if (finishedStatuses.has(current)) return value
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new LineaTimeoutError({ executionId, status: current })
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(intervalMs, remaining))
    )
    return poll(current)
  }
  return poll()
}

function beforeDeadline<T>(
  pending: Promise<T>,
  deadline: number,
  timeout: () => Error
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(timeout()),
      Math.max(0, deadline - Date.now())
    )
  })
  return Promise.race([pending, expired]).finally(() => clearTimeout(timer))
}
