import { useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@linealabs/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"
import { cn } from "@linealabs/ui/lib/utils"

import { ModelSetupForm } from "@/components/models/model-setup-form"
import type { CatalogModel } from "@/lib/model-settings-api"
import { modelMenu, type ModelGroup } from "./model-groups"
import type { ComposerOptions } from "./use-composer-options"

function ModelItems({ models }: Readonly<{ models: CatalogModel[] }>) {
  return models.map((model) => (
    <DropdownMenuRadioItem key={model.value} value={model.value}>
      {model.label}
    </DropdownMenuRadioItem>
  ))
}

function ModelSubmenu({
  label,
  groups,
}: Readonly<{ label: string; groups: ModelGroup[] }>) {
  if (groups.length === 0) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        {groups.map((group) => (
          <DropdownMenuGroup key={group.id}>
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            <ModelItems models={group.models} />
          </DropdownMenuGroup>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** The newest models that have a key; the rest, and those that need a key, are a level down. */
export function ModelMenu({
  options,
  open,
  onOpenChange,
}: Readonly<{
  options: ComposerOptions
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const { slug } = useParams({ strict: false })
  const [needsKey, setNeedsKey] = useState<CatalogModel | null>(null)
  const { latest, more, locked } = modelMenu(
    options.models,
    options.keyed,
    options.model
  )
  function choose(value: unknown) {
    const model = options.models.find((item) => item.value === value)
    if (!model) return
    onOpenChange(false)
    if (options.keyed.has(model.keyName)) options.onModelChange(model.value)
    else setNeedsKey(model)
  }
  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              disabled={options.models.length === 0}
              aria-label="Model"
              className={cn(
                "min-w-0 rounded-full font-normal",
                options.model === null && "text-primary ring-1 ring-primary/50"
              )}
            />
          }
        >
          <span className="truncate">
            {options.model?.label ?? "Choose a model"}
          </span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuRadioGroup
            value={options.model?.value ?? ""}
            onValueChange={choose}
          >
            <ModelItems models={latest} />
            {latest.length > 0 && more.length + locked.length > 0 ? (
              <DropdownMenuSeparator />
            ) : null}
            <ModelSubmenu label="More models" groups={more} />
            <ModelSubmenu label="Add a provider" groups={locked} />
          </DropdownMenuRadioGroup>
          {slug ? (
            <DropdownMenuItem
              render={<Link to="/w/$slug/settings/models" params={{ slug }} />}
            >
              Manage keys
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {slug && options.setup && needsKey ? (
        <Dialog open onOpenChange={() => setNeedsKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add your {needsKey.providerLabel} key</DialogTitle>
            </DialogHeader>
            <ModelSetupForm
              slug={slug}
              setup={{
                ...options.setup,
                settings: {
                  ...options.setup.settings,
                  defaultModel: needsKey.value,
                },
              }}
              onSaved={(values) => {
                options.onModelChange(values.model)
                setNeedsKey(null)
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
