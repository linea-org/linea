// eslint-disable-next-line no-restricted-imports -- only the Node-only json-schema entry uses this
import { Script } from "node:vm"

const LIMIT_MS = 250
const script = new Script("run()")

export class TimeLimitError extends Error {
  constructor() {
    super(`This took longer than ${LIMIT_MS} ms and was stopped`)
  }
}

/** Stops JavaScript at the limit, a regex included, but not native code such as RE2. */
export function runLimited<T>(run: () => T): T {
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
