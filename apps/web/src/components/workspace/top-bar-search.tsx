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
import { useSidebar } from "@linea/ui/components/sidebar"
import { cn } from "@linea/ui/lib/utils"

export function TopBarSearch() {
  const [open, setOpen] = useState(false)
  const { isMobile, state } = useSidebar()
  const iconOnly = !isMobile && state === "collapsed"

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
        size={iconOnly ? "icon-sm" : "xs"}
        aria-label="Find"
        className={cn(
          "text-muted-foreground",
          iconOnly ? "size-8" : "w-full justify-start"
        )}
        onClick={() => setOpen(true)}
      >
        <SearchIcon data-icon="inline-start" />
        {iconOnly ? null : (
          <>
            <span className="flex-1 text-left font-normal">Find</span>
            <KbdGroup>
              <Kbd>
                <CommandIcon />
              </Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </>
        )}
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty className="py-10">No results found.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </>
  )
}
