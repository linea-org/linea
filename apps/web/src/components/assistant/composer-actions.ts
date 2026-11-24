import type { LucideIcon } from "lucide-react"

/** One row of the plus menu, which the slash menu shows too. */
export type ComposerAction = {
  id: string
  label: string
  detail?: string
  /** Set on rows that switch something on or off. */
  checked?: boolean
  Icon: LucideIcon
  run: () => void
}

const SLASH = /^\/([\p{L}\p{N}]*)$/u

/** The actions a message that is only "/word" asks for; empty for any other message. */
export function slashMatches(
  value: string,
  actions: readonly ComposerAction[]
): ComposerAction[] {
  const query = SLASH.exec(value)?.[1].toLowerCase()
  if (query === undefined) return []
  return actions.filter((action) =>
    action.label
      .toLowerCase()
      .split(" ")
      .some((word) => word.startsWith(query))
  )
}
