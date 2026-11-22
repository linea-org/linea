import type { Ref } from "react"
import { LayoutGridIcon, PlayIcon, WorkflowIcon } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@linealabs/ui/components/command"

import {
  MENTION_KINDS,
  mentionKey,
  type MentionCandidate,
  type MentionKind,
} from "./mention-text"

const KIND_META = {
  run: { heading: "Runs", Icon: PlayIcon },
  workflow: { heading: "Workflows", Icon: WorkflowIcon },
  application: { heading: "Applications", Icon: LayoutGridIcon },
} satisfies Record<MentionKind, unknown>

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
      className="absolute inset-x-0 bottom-full z-10 mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-md"
      // Keeps focus in the textarea, so typing continues to narrow the list.
      onMouseDown={(event) => event.preventDefault()}
    >
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
