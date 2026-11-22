import {
  SHORTCUTS,
  SHORTCUT_SCOPES,
  type ShortcutId,
  type ShortcutScope,
} from "./definitions"

type KeyEventLike = Pick<
  KeyboardEvent,
  | "key"
  | "metaKey"
  | "ctrlKey"
  | "altKey"
  | "shiftKey"
  | "repeat"
  | "isComposing"
>

const MODIFIER_KEYS = new Set(["meta", "control", "alt", "shift"])

export function eventCombo(event: KeyEventLike): string {
  const key = event.key.toLowerCase()
  const shift = event.shiftKey && /^([a-z]|enter)$/.test(key) ? "shift+" : ""
  return `${event.metaKey || event.ctrlKey ? "mod+" : ""}${event.altKey ? "alt+" : ""}${shift}${key}`
}

const editableTargets =
  "input, textarea, select, [contenteditable='true'], [contenteditable='']"
const overlayTargets =
  "[role='dialog'], [role='menu'], [role='listbox'], [role='combobox']"

function matches(target: EventTarget | null, selector: string) {
  return target instanceof Element && target.closest(selector) !== null
}

export const isEditableTarget = (target: EventTarget | null) =>
  matches(target, editableTargets)

/** Dialogs, menus and popovers handle Escape themselves. */
export const isOverlayTarget = (target: EventTarget | null) =>
  matches(target, overlayTargets)

/** The shortcut scope the focused element sits in, if any. */
export function shortcutScopeOf(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const name = target
    .closest("[data-shortcut-scope]")
    ?.getAttribute("data-shortcut-scope")
  return name === "composer" ? name : null
}

/** Plain keys must not fire while typing or while a dialog or menu has focus. */
export const isTypingTarget = (target: EventTarget | null) =>
  isEditableTarget(target) || isOverlayTarget(target)

function inScope(id: ShortcutId, scope: ShortcutScope | null) {
  const required = SHORTCUT_SCOPES[id]
  return required === undefined || required === scope
}

type Entry = [combo: string, id: ShortcutId]

/**
 * Turns key presses into shortcut ids. Everything is a map lookup; the only state is the first
 * key of a possible sequence, so a key press that matches nothing costs next to nothing.
 */
export function createShortcutEngine(sequenceTimeoutMs = 1000) {
  const entries = Object.entries(SHORTCUTS).map(([id, { combo }]): Entry => [
    combo,
    id as ShortcutId,
  ])
  const single = new Map(entries.filter(([combo]) => !combo.includes(" ")))
  const sequences = new Map(entries.filter(([combo]) => combo.includes(" ")))
  const starters = new Set(
    [...sequences.keys()].map((combo) => combo.split(" ")[0])
  )
  let pending: { combo: string; at: number } | null = null
  return function resolve(
    event: KeyEventLike,
    typing: boolean,
    now: number,
    scope: ShortcutScope | null
  ): ShortcutId | null {
    if (event.repeat || event.isComposing) return null
    if (MODIFIER_KEYS.has(event.key.toLowerCase())) return null
    const combo = eventCombo(event)
    if (typing && !/^(mod|alt)\+/.test(combo)) {
      pending = null
      return null
    }
    if (pending && now - pending.at <= sequenceTimeoutMs) {
      const id = sequences.get(`${pending.combo} ${combo}`)
      pending = null
      if (id && inScope(id, scope)) return id
    }
    const id = single.get(combo)
    if (id) {
      pending = null
      return inScope(id, scope) ? id : null
    }
    pending = starters.has(combo) ? { combo, at: now } : null
    return null
  }
}
