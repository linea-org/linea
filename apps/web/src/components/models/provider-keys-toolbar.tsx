import { PlusIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"
import { Field, FieldLabel } from "@linealabs/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"

import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { FilterPopover } from "@/components/workspace/filter-popover"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import type { AiProviderKeyStatus } from "@/lib/secrets-api"

const STATUS_FILTERS = ["all", "connected", "not-connected"] as const

export type ProviderStatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_LABELS: Record<ProviderStatusFilter, string> = {
  all: "All providers",
  connected: "Connected",
  "not-connected": "Not connected",
}

export function ProviderKeysToolbar({
  status,
  onStatusChange,
  unconnected,
  onAdd,
}: Readonly<{
  status: ProviderStatusFilter
  onStatusChange: (status: ProviderStatusFilter) => void
  unconnected: AiProviderKeyStatus[]
  onAdd: (provider: AiProviderKeyStatus) => void
}>) {
  return (
    <PageToolbar>
      <FilterPopover
        label="Filter providers"
        active={status !== "all"}
        onReset={() => onStatusChange("all")}
      >
        <Field orientation="horizontal">
          <FieldLabel>Status</FieldLabel>
          <Select
            value={status}
            onValueChange={(value) => {
              const next = STATUS_FILTERS.find((filter) => filter === value)
              if (next) onStatusChange(next)
            }}
          >
            <SelectTrigger aria-label="Filter by status" className="w-40">
              <SelectValue>
                {(value: ProviderStatusFilter) => STATUS_LABELS[value]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((filter) => (
                <SelectItem key={filter} value={filter}>
                  {STATUS_LABELS[filter]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FilterPopover>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              disabled={unconnected.length === 0}
              {...shortcutTarget("create")}
            />
          }
        >
          <PlusIcon />
          Add key
          <ShortcutKeys id="create" onPrimary />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {unconnected.map((provider) => (
            <DropdownMenuItem key={provider.id} onClick={() => onAdd(provider)}>
              {provider.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </PageToolbar>
  )
}
