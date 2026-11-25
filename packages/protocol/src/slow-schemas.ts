const SLOW_MS = 100
const REST_RATIO = 3
const REMEMBER_MS = 600_000
const MAX_REMEMBERED = 100

const slowUntil = new Map<string, number>()
let restUntil = 0

/** True while a schema that was slow lately must wait, so all slow ones together get a quarter of the time. */
export function mustRest(schema: string): boolean {
  const now = performance.now()
  return now < restUntil && now < (slowUntil.get(schema) ?? 0)
}

export function recordTime(schema: string, tookMs: number): void {
  if (tookMs < SLOW_MS) return
  const now = performance.now()
  restUntil = Math.max(restUntil, now + tookMs * REST_RATIO)
  slowUntil.delete(schema)
  slowUntil.set(schema, now + REMEMBER_MS)
  const [oldest] = slowUntil.keys()
  if (slowUntil.size > MAX_REMEMBERED && oldest) slowUntil.delete(oldest)
}
