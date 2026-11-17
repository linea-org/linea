import { LineaTimeoutError } from "./http/errors.js"

const finishedStatuses = new Set(["succeeded", "failed", "cancelled"])

export type WaitOptions = {
  /** Milliseconds between polls. Defaults to 1000. */
  intervalMs?: number
  /** Milliseconds before giving up with `LineaTimeoutError`. Defaults to 300000. */
  timeoutMs?: number
}

/** Polls until the status is succeeded, failed or cancelled; a paused execution keeps waiting. */
export async function waitUntilFinished<T>(
  executionId: string,
  read: () => Promise<T>,
  status: (value: T) => string,
  options: WaitOptions
): Promise<T> {
  const intervalMs = options.intervalMs ?? 1000
  const deadline = Date.now() + (options.timeoutMs ?? 300_000)
  for (;;) {
    const value = await read()
    if (finishedStatuses.has(status(value))) return value
    if (Date.now() + intervalMs > deadline) {
      throw new LineaTimeoutError({ executionId, status: status(value) })
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
