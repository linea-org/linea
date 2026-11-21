import type { ReactNode } from "react"
import { ListFilterIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linealabs/ui/components/popover"

import { ShortcutTooltip } from "@/components/shortcuts/shortcut-tooltip"
import { useOpenShortcut } from "@/components/shortcuts/use-open-shortcut"

export function FilterPopover({
  label,
  active,
  onReset,
  children,
}: Readonly<{
  label: string
  active: boolean
  onReset: () => void
  children: ReactNode
}>) {
  const [open, setOpen] = useOpenShortcut("filter")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ShortcutTooltip id="filter" label="Filter" disabled={open}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label={label}
              className="relative"
            />
          }
        >
          <ListFilterIcon />
          {active ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
          ) : null}
        </PopoverTrigger>
      </ShortcutTooltip>
      <PopoverContent align="end" className="w-72 gap-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-3">{children}</div>
        <div className="flex justify-end border-t bg-muted/50 px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={!active}
            onClick={onReset}
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
