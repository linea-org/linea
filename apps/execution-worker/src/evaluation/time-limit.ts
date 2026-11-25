import { setTimeout as sleep } from "node:timers/promises"
import { runLimited } from "@linealabs/protocol/json-schema"

const REST_RATIO = 3

let last: Promise<unknown> = Promise.resolve()

/** Stops slow code at the limit; the next call waits three times as long as the last one took. */
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
