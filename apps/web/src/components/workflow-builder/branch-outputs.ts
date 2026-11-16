/** The cases, then the default branch: an edge from the default needs a handle of its own. */
export function branchOutputs(config: Record<string, unknown>): string[] {
  const cases = Object.keys((config.cases as Record<string, unknown>) ?? {})
  const fallback = config.defaultBranch
  return typeof fallback === "string" && fallback && !cases.includes(fallback)
    ? [...cases, fallback]
    : cases
}
