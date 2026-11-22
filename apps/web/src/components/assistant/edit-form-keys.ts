type EditKeyEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "preventDefault"
>

export function handleEditKeyDown(
  event: EditKeyEvent,
  edit: { changed: boolean; onCancel: () => void; onSubmit: () => void }
) {
  if (event.key === "Escape") edit.onCancel()
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    // Consumed even when nothing changed, so the page-level send shortcut cannot send the
    // main composer's draft instead.
    event.preventDefault()
    if (edit.changed) edit.onSubmit()
  }
}
