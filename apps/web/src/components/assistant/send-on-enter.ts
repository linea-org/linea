import type { KeyboardEvent } from "react"

/** Enter sends, Shift+Enter adds a line, and Enter that ends an IME composition does neither. */
export function sendOnEnter(
  event: KeyboardEvent<HTMLElement>,
  send: () => void
) {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.nativeEvent.isComposing
  ) {
    return
  }
  event.preventDefault()
  send()
}
