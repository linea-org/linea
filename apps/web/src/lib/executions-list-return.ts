/** Remembers the executions list's search for this tab, so leaving a run returns to that list. */
type ListSearch = Record<string, string | number | undefined>

function storageKey(slug: string) {
  return `linea:executions-list:${slug}`
}

export function rememberExecutionsList(slug: string, search: ListSearch) {
  try {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(search))
  } catch (error) {
    console.warn("Could not remember the executions list", error)
  }
}

/** Unvalidated: the list route's `validateSearch` drops anything it does not recognise. */
export function recallExecutionsList(slug: string): Record<string, unknown> {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(storageKey(slug)) ?? "{}"
    )
    return typeof stored === "object" && stored !== null ? { ...stored } : {}
  } catch (error) {
    console.warn("Could not recall the executions list", error)
    return {}
  }
}
