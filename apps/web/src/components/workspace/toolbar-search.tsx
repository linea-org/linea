import type { Ref } from "react"
import { SearchIcon } from "lucide-react"

import { Input } from "@linea/ui/components/input"
import { Kbd } from "@linea/ui/components/kbd"
import { cn } from "@linea/ui/lib/utils"

type ToolbarSearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputRef?: Ref<HTMLInputElement>
  shortcut?: string
  autoFocus?: boolean
}

export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  inputRef,
  shortcut,
  autoFocus,
}: Readonly<ToolbarSearchProps>) {
  return (
    <div className="relative w-full max-w-md min-w-48 flex-1">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "h-8 bg-background pl-8",
          shortcut && (shortcut.length > 1 ? "pr-12" : "pr-8")
        )}
      />
      {shortcut ? (
        <Kbd className="absolute top-1/2 right-1.5 -translate-y-1/2">
          {shortcut}
        </Kbd>
      ) : null}
    </div>
  )
}
