import { useContext, useRef, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Input } from "@linealabs/ui/components/input"
import { Kbd } from "@linealabs/ui/components/kbd"
import { cn } from "@linealabs/ui/lib/utils"

import { ShortcutTooltip } from "@/components/shortcuts/shortcut-tooltip"
import { useShortcut } from "@/components/shortcuts/use-shortcut"
import { PageToolbarContext } from "./page-toolbar-context"

type ToolbarSearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  shortcut?: string
  autoFocus?: boolean
}

export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  shortcut,
  autoFocus,
}: Readonly<ToolbarSearchProps>) {
  const inToolbar = useContext(PageToolbarContext)
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  useShortcut("focus-search", inToolbar ? () => input.current?.focus() : null)
  return (
    // In a page toolbar it folds to an icon until focused or holding a query.
    <ShortcutTooltip
      id="focus-search"
      label="Search"
      disabled={!inToolbar || focused || value !== ""}
    >
      <div className="group/search relative w-full max-w-md min-w-48 flex-1 in-data-[slot=page-toolbar]:w-8 in-data-[slot=page-toolbar]:min-w-8 in-data-[slot=page-toolbar]:flex-none in-data-[slot=page-toolbar]:transition-[width] focus-within:in-data-[slot=page-toolbar]:w-56 has-[input:not(:placeholder-shown)]:in-data-[slot=page-toolbar]:w-56">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={placeholder}
          className={cn(
            "pl-8 in-data-[slot=page-toolbar]:cursor-pointer in-data-[slot=page-toolbar]:px-0 not-placeholder-shown:in-data-[slot=page-toolbar]:pl-8 in-data-[slot=page-toolbar]:placeholder:text-transparent focus:in-data-[slot=page-toolbar]:cursor-text focus:in-data-[slot=page-toolbar]:pl-8 focus:in-data-[slot=page-toolbar]:placeholder:text-muted-foreground",
            shortcut && (shortcut.length > 1 ? "pr-12" : "pr-8"),
            shortcut &&
              "in-data-[slot=page-toolbar]:pr-0 focus:in-data-[slot=page-toolbar]:pr-8"
          )}
        />
        {shortcut ? (
          <Kbd className="absolute top-1/2 right-1.5 -translate-y-1/2 in-data-[slot=page-toolbar]:hidden group-focus-within/search:in-data-[slot=page-toolbar]:inline-flex">
            {shortcut}
          </Kbd>
        ) : null}
      </div>
    </ShortcutTooltip>
  )
}
