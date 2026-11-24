import { useState, type KeyboardEvent } from "react"

import { slashMatches, type ComposerAction } from "./composer-actions"

export function useSlashMenu(
  value: string,
  onChange: (value: string) => void,
  actions: readonly ComposerAction[]
) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const items = dismissed === value ? [] : slashMatches(value, actions)
  const active = items.find((item) => item.id === activeId) ?? items.at(0)

  function pick(action: ComposerAction) {
    onChange("")
    action.run()
  }

  /** Returns true when the key belonged to the open menu, so the message must ignore it. */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>): boolean {
    if (!active || event.nativeEvent.isComposing || event.shiftKey) return false
    if (event.key === "Escape") {
      // React listens on document, as does the page-wide Escape handler that would blur the field.
      event.nativeEvent.stopImmediatePropagation()
      setDismissed(value)
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1
      const next = items.indexOf(active) + step + items.length
      setActiveId(items[next % items.length].id)
    } else if (event.key === "Enter" || event.key === "Tab") {
      pick(active)
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  return { items, active, setActiveId, pick, handleKeyDown }
}
