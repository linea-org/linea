import type { ClickShortcutId } from "@/lib/shortcuts/definitions"

/** Spread onto a button that shortcuts should press: `{...shortcutTarget("create", "add-agent")}`. */
export function shortcutTarget(...ids: ClickShortcutId[]) {
  return { "data-shortcut-target": ids.join(" ") }
}

/** The first button for this shortcut that is shown and enabled, so a hidden one cannot swallow the key. */
export function findShortcutTarget(id: ClickShortcutId) {
  return [
    ...document.querySelectorAll<HTMLElement>(
      `[data-shortcut-target~="${id}"]`
    ),
  ].find(
    (element) =>
      element.getClientRects().length > 0 &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true"
  )
}
