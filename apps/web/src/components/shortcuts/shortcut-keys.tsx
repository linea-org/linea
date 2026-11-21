import { useSyncExternalStore } from "react"

import { Kbd, KbdGroup } from "@linealabs/ui/components/kbd"
import { cn } from "@linealabs/ui/lib/utils"

import {
  SHORTCUTS,
  comboKeys,
  type ShortcutId,
} from "@/lib/shortcuts/definitions"

const subscribeNever = () => () => undefined

/** False on the server and first paint so ⌘ versus Ctrl cannot cause a hydration mismatch. */
export function useIsMac() {
  return useSyncExternalStore(
    subscribeNever,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false
  )
}

/** The key hint for a shortcut; hidden on touch screens, where there is no keyboard. */
export function ShortcutKeys({
  id,
  onPrimary,
}: Readonly<{ id: ShortcutId; onPrimary?: boolean }>) {
  const isMac = useIsMac()
  return (
    <KbdGroup
      className={cn(
        "[@media(pointer:coarse)]:hidden",
        onPrimary &&
          "[&_kbd]:bg-primary-foreground/20 [&_kbd]:text-primary-foreground"
      )}
    >
      {comboKeys(SHORTCUTS[id].combo, isMac).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}
