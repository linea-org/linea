import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ArrowDownIcon, ArrowUpIcon, CornerDownLeftIcon } from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@linea/ui/components/command"
import { Kbd } from "@linea/ui/components/kbd"

import { CommandPaletteContext } from "./command-palette-context"
import {
  ActionsGroup,
  ApplicationsGroup,
  ChatsGroup,
  PagesGroup,
  WorkflowsGroup,
  WorkspacesGroup,
} from "./command-palette-groups"
import type { WorkspaceOption } from "./workspace-switcher"

function CommandPaletteFooter() {
  return (
    <div className="flex h-10 items-center gap-4 border-t px-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Kbd>
          <ArrowUpIcon />
        </Kbd>
        <Kbd>
          <ArrowDownIcon />
        </Kbd>
        Navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>
          <CornerDownLeftIcon />
        </Kbd>
        Open
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Kbd>Esc</Kbd>
        Close
      </span>
    </div>
  )
}

export function CommandPaletteProvider({
  slug,
  workspaces,
  children,
}: Readonly<{
  slug: string
  workspaces: WorkspaceOption[]
  children: ReactNode
}>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const openPalette = useCallback(() => setOpen(true), [])
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      setOpen((prev) => !prev)
      setSearch("")
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])
  const setOpenAndReset = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) setSearch("")
  }, [])
  const run = useCallback((action: () => unknown) => {
    setOpen(false)
    setSearch("")
    void action()
  }, [])
  const searching = search.trim().length > 0
  return (
    <CommandPaletteContext.Provider value={openPalette}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpenAndReset}
        title="Search Linea"
        description="Jump to a page, workflow or application, or run an action."
      >
        <CommandInput
          placeholder="Search pages, workflows, chats…"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <PagesGroup slug={slug} run={run} searching={searching} />
          <WorkflowsGroup slug={slug} run={run} searching={searching} />
          <ApplicationsGroup slug={slug} run={run} searching={searching} />
          <ChatsGroup slug={slug} run={run} searching={searching} />
          <ActionsGroup slug={slug} run={run} searching={searching} />
          <WorkspacesGroup
            slug={slug}
            run={run}
            searching={searching}
            workspaces={workspaces}
          />
        </CommandList>
        <CommandPaletteFooter />
      </CommandDialog>
    </CommandPaletteContext.Provider>
  )
}
