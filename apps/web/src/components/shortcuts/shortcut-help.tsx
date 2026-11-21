import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@linealabs/ui/components/dialog"

import {
  SHORTCUTS,
  isClickShortcut,
  type ShortcutId,
} from "@/lib/shortcuts/definitions"

import { ShortcutKeys } from "./shortcut-keys"
import { shortcutHandlers } from "./shortcut-registry"
import { findShortcutTarget } from "./shortcut-target"
import { useShortcut } from "./use-shortcut"

const GROUPS = ["General", "Go to", "This page"] as const

/** Page keys are listed only where they work: a marked button exists or a handler is registered. */
function isAvailable(id: ShortcutId) {
  if (SHORTCUTS[id].group !== "This page") return true
  return isClickShortcut(id)
    ? findShortcutTarget(id) !== null
    : shortcutHandlers.has(id)
}

function ShortcutRows({ group }: Readonly<{ group: (typeof GROUPS)[number] }>) {
  const ids = (Object.keys(SHORTCUTS) as ShortcutId[]).filter(
    (id) => SHORTCUTS[id].group === group && isAvailable(id)
  )
  if (ids.length === 0) return null
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">
        {group}
      </h3>
      <ul>
        {ids.map((id) => (
          <li key={id} className="flex items-center justify-between py-1.5">
            <span>{SHORTCUTS[id].label}</span>
            <ShortcutKeys id={id} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Press ? anywhere; the list is only built while the dialog is open. */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false)
  useShortcut("help", () => setOpen((current) => !current))
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <ShortcutRows key={group} group={group} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
