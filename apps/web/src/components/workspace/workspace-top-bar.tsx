import { BookOpenIcon } from "lucide-react"

import { buttonVariants } from "@linea/ui/components/button"
import { Separator } from "@linea/ui/components/separator"
import { SidebarTrigger, useSidebar } from "@linea/ui/components/sidebar"
import { cn } from "@linea/ui/lib/utils"

import { useWorkspaceCrumbs } from "./top-bar-breadcrumb"
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher"

type WorkspaceTopBarProps = {
  slug: string
  workspaces: WorkspaceOption[]
}

export function WorkspaceTopBar({ slug, workspaces }: WorkspaceTopBarProps) {
  const { isMobile, state } = useSidebar()
  const collapsed = !isMobile && state === "collapsed"
  const crumbs = useWorkspaceCrumbs(slug)
  const title = crumbs[crumbs.length - 1]?.label
  return (
    <header className="z-30 flex h-12 shrink-0 items-center border-b border-border/70 bg-sidebar">
      <div
        className={cn(
          "flex h-full shrink-0 items-center gap-1 transition-[width] duration-200 ease-linear",
          isMobile && "px-2",
          !isMobile && collapsed && "w-(--sidebar-width-icon) justify-center",
          !isMobile && !collapsed && "w-(--sidebar-width) px-2"
        )}
      >
        <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
      </div>
      <Separator
        orientation="vertical"
        className="mx-0 -ml-px hidden h-12 md:block"
      />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3">
        <div className="flex min-w-0 items-center justify-self-start">
          <SidebarTrigger size="icon-xs" className="-ml-1" />
        </div>
        <h1 className="max-w-80 truncate text-sm font-medium text-foreground">
          {title}
        </h1>
        <a
          href="https://docs.getlinea.app"
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "mr-2 gap-1.5 justify-self-end"
          )}
        >
          <BookOpenIcon />
          Learn
        </a>
      </div>
    </header>
  )
}
