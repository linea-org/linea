/** Dot-path only, e.g. "body.items" — no expression language, deliberately, for Phase 0's scope. */
export function getPath(value: unknown, path: string): unknown {
  if (!path) return value
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, value)
}
