export type ReferenceTarget = HTMLInputElement | HTMLTextAreaElement

/** Marks an input that takes references; "json" when its text is JSON. */
export const REFERENCE_TARGET = "data-reference-target"

function isInsideString(json: string): boolean {
  return (json.match(/(?<!\\)"/g)?.length ?? 0) % 2 === 1
}

/** Inserts at the caret, quoted when the caret is outside a JSON string. */
export function insertReference(target: ReferenceTarget, text: string): void {
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const reference = `{{${text}}}`
  let inserted = reference
  if (target.getAttribute(REFERENCE_TARGET) === "json") {
    const quoted = JSON.stringify(reference)
    inserted = isInsideString(target.value.slice(0, start))
      ? quoted.slice(1, -1)
      : quoted
  }
  target.setRangeText(inserted, start, end, "end")
  // React reads the new value from the event, so every editor keeps its own change handling.
  target.dispatchEvent(new Event("input", { bubbles: true }))
}
