import {
  Command,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@linealabs/ui/components/command"

import type { ComposerAction } from "./composer-actions"

export function SlashMenu({
  items,
  active,
  onActiveChange,
  onPick,
}: Readonly<{
  items: ComposerAction[]
  active: ComposerAction
  onActiveChange: (id: string) => void
  onPick: (action: ComposerAction) => void
}>) {
  return (
    <div className="absolute bottom-full left-3 z-10 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-md group-data-hero/composer:top-full group-data-hero/composer:bottom-auto group-data-hero/composer:left-0 group-data-hero/composer:mt-2">
      <output className="sr-only">{active.label}</output>
      <Command
        shouldFilter={false}
        label="Message actions"
        value={active.id}
        onValueChange={onActiveChange}
      >
        <CommandList>
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={item.id}
              data-checked={item.checked === true}
              // Keeps focus in the message when a row is clicked.
              onMouseDown={(event) => event.preventDefault()}
              onSelect={() => onPick(item)}
            >
              <item.Icon />
              {item.label}
              {item.detail ? (
                <CommandShortcut className="tracking-normal">
                  {item.detail}
                </CommandShortcut>
              ) : null}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  )
}
