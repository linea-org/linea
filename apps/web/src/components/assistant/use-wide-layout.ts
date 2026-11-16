import { useSyncExternalStore } from "react"

const QUERY = "(min-width: 1024px)"

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/** Matches Tailwind's `lg`: below it the details sidebar becomes a sheet. */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true
  )
}
