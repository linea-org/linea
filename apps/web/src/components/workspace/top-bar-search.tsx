import { SearchIcon } from "lucide-react"
import { useState } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@linea/ui/components/command"
import { Kbd } from "@linea/ui/components/kbd"

export function TopBarSearch() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border border-input/30 bg-input/30 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-input/50"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </>
  )
}
