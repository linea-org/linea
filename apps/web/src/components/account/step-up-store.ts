import { useSyncExternalStore } from "react"

let open = false
const listeners = new Set<() => void>()

function emit(next: boolean) {
  open = next
  for (const listener of listeners) listener()
}

export const requestStepUp = () => emit(true)
export const dismissStepUp = () => emit(false)

export function useStepUpOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
    () => false
  )
}
