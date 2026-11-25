import { PlusIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"

import type { ComposerAction } from "./composer-actions"

export function PlusMenu({
  actions,
}: Readonly<{ actions: readonly ComposerAction[] }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Add to message"
          />
        }
      >
        <PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {actions.map(({ id, label, detail, checked, Icon, run }) =>
          checked === undefined ? (
            <DropdownMenuItem key={id} onClick={run}>
              <Icon />
              {label}
              {detail ? (
                <DropdownMenuShortcut className="max-w-28 truncate tracking-normal">
                  {detail}
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuCheckboxItem
              key={id}
              checked={checked}
              onCheckedChange={run}
            >
              <Icon />
              {label}
            </DropdownMenuCheckboxItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
