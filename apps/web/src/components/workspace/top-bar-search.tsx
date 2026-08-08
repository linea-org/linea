import { CommandIcon, SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@linea/ui/components/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@linea/ui/components/command"
import { Kbd, KbdGroup } from "@linea/ui/components/kbd"

export function TopBarSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full max-w-sm justify-start gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <SearchIcon data-icon="inline-start" />
        <span className="flex-1 text-left font-normal">Search…</span>
        <KbdGroup>
          <Kbd>
            <CommandIcon />
          </Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </>
  )
}
