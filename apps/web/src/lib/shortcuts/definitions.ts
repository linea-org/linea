type ShortcutGroup = "General" | "Go to" | "This page"

/** Combos are lowercase: `mod` is ⌘ or Ctrl, and a space between keys means one after the other. */
export const SHORTCUTS = {
  search: { combo: "mod+k", label: "Search", group: "General" },
  sidebar: {
    combo: "mod+b",
    label: "Show or hide the sidebar",
    group: "General",
  },
  help: { combo: "?", label: "Keyboard shortcuts", group: "General" },
  "go-home": { combo: "g h", label: "Home", group: "Go to" },
  "go-applications": { combo: "g a", label: "Applications", group: "Go to" },
  "go-workflows": { combo: "g w", label: "Workflows", group: "Go to" },
  "go-executions": { combo: "g e", label: "Executions", group: "Go to" },
  "go-inky": { combo: "g i", label: "Inky", group: "Go to" },
  "go-settings": { combo: "g s", label: "Settings", group: "Go to" },
  create: { combo: "c", label: "Create", group: "This page" },
  edit: { combo: "e", label: "Edit", group: "This page" },
  run: { combo: "r", label: "Run or replay", group: "This page" },
  "add-agent": { combo: "a", label: "Add Agent", group: "This page" },
  "starter-workflow": {
    combo: "s",
    label: "Starter workflow",
    group: "This page",
  },
  "add-to-suite": {
    combo: "t",
    label: "Add to regression suite",
    group: "This page",
  },
  fix: { combo: "u", label: "Fix this error", group: "This page" },
  "mark-all-read": { combo: "m", label: "Mark all read", group: "This page" },
  "open-builder": { combo: "b", label: "Open builder", group: "This page" },
  "ask-inky": { combo: "i", label: "Ask Inky", group: "This page" },
  "focus-search": { combo: "/", label: "Search this page", group: "This page" },
  filter: { combo: "f", label: "Filter", group: "This page" },
  send: { combo: "mod+enter", label: "Send message", group: "This page" },
} as const satisfies Record<
  string,
  { combo: string; label: string; group: ShortcutGroup }
>

export type ShortcutId = keyof typeof SHORTCUTS

/** These press the page's button that marks itself with the same id. */
export const CLICK_SHORTCUTS = [
  "create",
  "edit",
  "run",
  "open-builder",
  "ask-inky",
  "add-agent",
  "starter-workflow",
  "add-to-suite",
  "fix",
  "mark-all-read",
  "send",
] as const satisfies readonly ShortcutId[]

export type ClickShortcutId = (typeof CLICK_SHORTCUTS)[number]

export function isClickShortcut(id: ShortcutId): id is ClickShortcutId {
  return (CLICK_SHORTCUTS as readonly ShortcutId[]).includes(id)
}

const KEY_NAMES: Record<string, string> = { escape: "Esc", enter: "↵" }

/** The keys to draw for a combo, with ⌘ on Mac and Ctrl elsewhere. */
export function comboKeys(combo: string, isMac: boolean): string[] {
  return combo.split(/[\s+]/).map((key) => {
    if (key === "mod") return isMac ? "⌘" : "Ctrl"
    if (key === "alt") return isMac ? "⌥" : "Alt"
    return KEY_NAMES[key] ?? key.toUpperCase()
  })
}
