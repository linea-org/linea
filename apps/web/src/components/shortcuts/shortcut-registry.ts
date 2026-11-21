import type { ShortcutId } from "@/lib/shortcuts/definitions"

/** Plain module state: a key press never touches React unless a handler is registered for it. */
export const shortcutHandlers = new Map<ShortcutId, () => void>()
