import { useMatches } from "@tanstack/react-router"
import { BookOpenIcon } from "lucide-react"

import { buttonVariants } from "@linea/ui/components/button"
import { Separator } from "@linea/ui/components/separator"
import { SidebarTrigger, useSidebar } from "@linea/ui/components/sidebar"
import { cn } from "@linea/ui/lib/utils"

import { useWorkspaceCrumbs } from "./top-bar-breadcrumb"
import { WorkflowHeading } from "./workflow-heading"
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher"

type WorkspaceTopBarProps = {
  slug: string
  workspaces: WorkspaceOption[]
}

export function WorkspaceTopBar({
  slug,
  workspaces,
}: Readonly<WorkspaceTopBarProps>) {
  const { isMobile, state } = useSidebar()
  const collapsed = !isMobile && state === "collapsed"
  const crumbs = useWorkspaceCrumbs(slug)
  const title = crumbs.at(-1)?.label
  const workflow = useMatches().find(
    (match) => match.routeId === "/w/$slug/workflows/$workflowId/"
  )?.loaderData?.workflow
  return (
    <header className="z-30 flex h-12 shrink-0 items-center border-b border-border/70 bg-sidebar">
      <div
        className={cn(
          "flex h-full w-auto shrink-0 items-center gap-1 px-2 transition-[width] duration-200 ease-linear md:px-0",
          !isMobile &&
            collapsed &&
            "justify-center md:w-(--sidebar-width-icon)",
          !isMobile && !collapsed && "md:w-(--sidebar-width) md:px-2"
        )}
      >
        <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
      </div>
      <Separator
        orientation="vertical"
        className="mx-0 -ml-px hidden h-12 md:block"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-3 md:px-3">
        <div className="flex shrink-0 items-center justify-self-start">
          <SidebarTrigger size="icon-xs" className="-ml-1" />
        </div>
        <div className="min-w-0 flex-1 md:justify-self-center">
          {workflow ? (
            <WorkflowHeading slug={slug} workflow={workflow} />
          ) : (
            <h1 className="max-w-80 truncate text-sm font-medium text-foreground">
              {title}
            </h1>
          )}
        </div>
        <a
          href="https://docs.getlinea.app"
          target="_blank"
          rel="noreferrer"
          aria-label="Learn about Linea"
          className={cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "mr-2 gap-1.5 justify-self-end"
          )}
        >
          <BookOpenIcon />
          <span className="hidden sm:inline">Learn</span>
        </a>
      </div>
    </header>
  )
}
