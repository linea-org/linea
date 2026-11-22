import { useEffect } from "react"

import {
  createShortcutEngine,
  isEditableTarget,
  isOverlayTarget,
  isTypingTarget,
  shortcutScopeOf,
} from "@/lib/shortcuts/engine"

import { shortcutHandlers } from "./shortcut-registry"

/** The only keydown listener for shortcuts; mount it once. */
export function ShortcutListener() {
  useEffect(() => {
    const resolve = createShortcutEngine()
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        event.target instanceof HTMLElement &&
        isEditableTarget(event.target) &&
        !isOverlayTarget(event.target)
      ) {
        event.target.blur()
        return
      }
      if (event.defaultPrevented) return
      const id = resolve(
        event,
        isTypingTarget(event.target),
        event.timeStamp,
        shortcutScopeOf(event.target)
      )
      const handler = id ? shortcutHandlers.get(id) : undefined
      if (!handler) return
      event.preventDefault()
      handler()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])
  return null
}
