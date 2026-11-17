import { CommandIcon, SearchIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import { Kbd, KbdGroup } from "@linealabs/ui/components/kbd"

import { useOpenCommandPalette } from "./command-palette-context"

export function TopBarSearch() {
  const open = useOpenCommandPalette()
  return (
    <Button
      type="button"
      variant="outline"
      aria-label="Search"
      className="w-full max-w-sm justify-start gap-2 px-3 font-normal text-muted-foreground shadow-none"
      onClick={open}
    >
      <SearchIcon />
      <span className="flex-1 truncate text-left">Search or jump to…</span>
      <KbdGroup className="hidden sm:inline-flex">
        <Kbd>
          <CommandIcon />
        </Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </Button>
  )
}

export function TopBarSearchIcon() {
  const open = useOpenCommandPalette()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Search"
      className="md:hidden"
      onClick={open}
    >
      <SearchIcon />
    </Button>
  )
}
