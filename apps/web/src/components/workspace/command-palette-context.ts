import { createContext, useContext } from "react"

export const CommandPaletteContext = createContext<(() => void) | null>(null)

export function useOpenCommandPalette() {
  const open = useContext(CommandPaletteContext)
  if (!open) throw new Error("CommandPaletteContext is not provided")
  return open
}
