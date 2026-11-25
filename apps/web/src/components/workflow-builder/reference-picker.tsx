import { useState, type RefObject } from "react"
import { BracesIcon } from "lucide-react"
import { Button } from "@linealabs/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@linealabs/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linealabs/ui/components/popover"

import type { ReferenceGroup } from "./reference-options"
import { useSecretNames } from "./use-secret-names"

type SelectReference = (text: string) => void

function ReferenceItems({
  group,
  onSelect,
}: Readonly<{ group: ReferenceGroup; onSelect: SelectReference }>) {
  return (
    <CommandGroup heading={group.heading}>
      {group.items.map(({ label, text }) => (
        <CommandItem
          key={text}
          value={`${group.heading} ${label} ${text}`}
          onSelect={() => onSelect(text)}
        >
          <span className="truncate">{label}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function SecretItems({
  applicationId,
  onSelect,
}: Readonly<{
  applicationId: string | undefined
  onSelect: SelectReference
}>) {
  const { names, error, pending } = useSecretNames(applicationId)
  const status = error ? error.message : pending && "Loading…"
  if (status) {
    return (
      <CommandGroup heading="Secrets">
        <CommandItem value="Secrets" disabled>
          {status}
        </CommandItem>
      </CommandGroup>
    )
  }
  if (names.length === 0) return null
  const items = names.map(({ name }) => ({
    label: name,
    text: `secrets.${name}`,
  }))
  return (
    <ReferenceItems
      group={{ id: "secrets", heading: "Secrets", items }}
      onSelect={onSelect}
    />
  )
}

export function ReferencePicker({
  label,
  groups,
  withSecrets,
  applicationId,
  finalFocus,
  onSelect,
}: Readonly<{
  label: string
  groups: ReferenceGroup[]
  withSecrets: boolean
  applicationId: string | undefined
  finalFocus: RefObject<HTMLElement | null>
  onSelect: SelectReference
}>) {
  const [open, setOpen] = useState(false)
  const select = (text: string) => {
    onSelect(text)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label={`Insert a value in ${label}`}
            title="Insert a value"
          />
        }
      >
        <BracesIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" finalFocus={finalFocus}>
        <Command className="rounded-md bg-transparent">
          <CommandInput placeholder="Search values" />
          <CommandList>
            <CommandEmpty>No matching values.</CommandEmpty>
            {groups.map((group) => (
              <ReferenceItems key={group.id} group={group} onSelect={select} />
            ))}
            {withSecrets ? (
              <SecretItems applicationId={applicationId} onSelect={select} />
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
