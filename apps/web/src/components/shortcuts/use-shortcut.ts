import { useEffect, useRef } from "react"

import type { ShortcutId } from "@/lib/shortcuts/definitions"

import { shortcutHandlers } from "./shortcut-registry"

/** Registers once per mount; the handler may change every render without re-registering. */
export function useShortcut(id: ShortcutId, handler: (() => void) | null) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  const active = handler !== null
  useEffect(() => {
    if (!active) return
    const run = () => latest.current?.()
    shortcutHandlers.set(id, run)
    return () => {
      if (shortcutHandlers.get(id) === run) shortcutHandlers.delete(id)
    }
  }, [id, active])
}
