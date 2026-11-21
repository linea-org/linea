import type { ReactElement } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linealabs/ui/components/tooltip"

import type { ShortcutId } from "@/lib/shortcuts/definitions"

import { ShortcutKeys } from "./shortcut-keys"

/** Wraps one icon-only control; the tooltip names it and shows its key. */
export function ShortcutTooltip({
  id,
  label,
  disabled,
  children,
}: Readonly<{
  id: ShortcutId
  label: string
  disabled?: boolean
  children: ReactElement
}>) {
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger render={children} />
      <TooltipContent className="flex items-center gap-2">
        {label}
        <ShortcutKeys id={id} />
      </TooltipContent>
    </Tooltip>
  )
}
