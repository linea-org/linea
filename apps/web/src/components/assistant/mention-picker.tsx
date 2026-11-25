import type { Ref } from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@linealabs/ui/components/command"

import { KIND_META } from "./mention-kinds"
import {
  MENTION_KINDS,
  mentionKey,
  type MentionCandidate,
} from "./mention-text"

export function MentionPicker({
  ref,
  items,
  activeKey,
  onActiveChange,
  onPick,
  isLoading,
  error,
}: Readonly<{
  ref: Ref<HTMLDivElement>
  items: MentionCandidate[]
  activeKey: string | null
  onActiveChange: (key: string) => void
  onPick: (candidate: MentionCandidate) => void
  isLoading: boolean
  error: Error | null
}>) {
  let emptyMessage = "No matches"
  if (error) emptyMessage = "Could not load runs, Workflows and Applications"
  else if (isLoading) emptyMessage = "Loading…"
  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-full z-10 mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-md group-data-hero/composer:top-full group-data-hero/composer:bottom-auto group-data-hero/composer:mt-2"
    >
      <output className="sr-only">
        {items.length > 0 ? `${items.length} matches` : emptyMessage}
      </output>
      <Command
        shouldFilter={false}
        label="Mention a run, Workflow or Application"
        value={activeKey ?? ""}
        onValueChange={onActiveChange}
      >
        <CommandList>
          {items.length === 0 ? (
            <CommandEmpty>{emptyMessage}</CommandEmpty>
          ) : null}
          {MENTION_KINDS.map((kind) => {
            const group = items.filter((item) => item.kind === kind)
            if (group.length === 0) return null
            const { heading, Icon } = KIND_META[kind]
            return (
              <CommandGroup key={kind} heading={heading}>
                {group.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={mentionKey(item)}
                    onSelect={() => onPick(item)}
                  >
                    <Icon />
                    <span className="truncate">{item.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </Command>
    </div>
  )
}
