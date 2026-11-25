import { setTimeout as sleep } from "node:timers/promises"
import { Script } from "node:vm"

const LIMIT_MS = 250
const REST_RATIO = 3
const script = new Script("run()")

export class TimeLimitError extends Error {
  constructor() {
    super(`This took longer than ${LIMIT_MS} ms and was stopped`)
  }
}

function runLimited<T>(run: () => T): T {
  try {
    return script.runInNewContext({ run }, { timeout: LIMIT_MS }) as T
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
    ) {
      throw new TimeLimitError()
    }
    throw error
  }
}

let last: Promise<unknown> = Promise.resolve()

/** Runs code an author's pattern or schema can make arbitrarily slow, such as a regex: it is stopped
 * at the limit, and the next call waits longer than it took, so other runs keep most of the time. */
export function withTimeLimit<T>(run: () => T): Promise<T> {
  let took = 0
  const result = last.then(() => {
    const started = performance.now()
    try {
      return runLimited(run)
    } finally {
      took = performance.now() - started
    }
  })
  const rest = () => sleep(took * REST_RATIO, undefined, { ref: false })
  last = result.then(rest, rest)
  return result
}
