import { useState } from "react"

import type { ShortcutId } from "@/lib/shortcuts/definitions"

import { useShortcut } from "./use-shortcut"

/** Open state for a menu or popover that its shortcut key should open. */
export function useOpenShortcut(id: ShortcutId) {
  const [open, setOpen] = useState(false)
  useShortcut(id, () => setOpen(true))
  return [open, setOpen] as const
}
