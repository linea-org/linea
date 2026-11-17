import { Link, useLocation, useMatches } from "@tanstack/react-router"
import { WandSparklesIcon } from "lucide-react"

import { buttonVariants } from "@linealabs/ui/components/button"
import { Separator } from "@linealabs/ui/components/separator"
import { SidebarTrigger, useSidebar } from "@linealabs/ui/components/sidebar"
import { cn } from "@linealabs/ui/lib/utils"

import { ASSISTANT_NAME } from "@/lib/assistant-api"

import { HelpMenu } from "./help-menu"
import { TopBarBreadcrumb } from "./top-bar-breadcrumb"
import { TopBarSearch, TopBarSearchIcon } from "./top-bar-search"
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
  const { pathname } = useLocation()
  const onAssistant = pathname.startsWith(`/w/${slug}/assistant`)
  const collapsed = !isMobile && state === "collapsed"
  const workflow = useMatches().find(
    (match) => match.routeId === "/w/$slug/workflows/$workflowId/"
  )?.loaderData?.workflow
  return (
    <header className="z-30 flex h-12 shrink-0 items-center border-b bg-sidebar">
      <div
        className={cn(
          "flex h-full w-auto shrink-0 items-center gap-1 px-2 transition-all duration-200 ease-out md:px-0",
          !isMobile &&
            collapsed &&
            "justify-center md:w-(--sidebar-width-icon)",
          !isMobile && !collapsed && "md:w-(--sidebar-width) md:px-2"
        )}
      >
        <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
      </div>
      <Separator orientation="vertical" className="hidden h-12 md:block" />
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
        <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
          <SidebarTrigger
            variant="secondary"
            size="icon-sm"
            className="shrink-0"
          />
          {workflow ? (
            <WorkflowHeading slug={slug} workflow={workflow} />
          ) : (
            <TopBarBreadcrumb slug={slug} />
          )}
        </div>
        <div className="hidden w-full max-w-sm justify-center md:flex">
          <TopBarSearch />
        </div>
        <div className="flex flex-1 basis-0 items-center justify-end gap-1">
          <TopBarSearchIcon />
          <Link
            to="/w/$slug/assistant"
            params={{ slug }}
            aria-current={onAssistant ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-primary/30 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/15 hover:text-primary",
              onAssistant && "border-primary/50 bg-primary/15"
            )}
          >
            <WandSparklesIcon />
            <span className="hidden sm:inline">Ask {ASSISTANT_NAME}</span>
          </Link>
          <HelpMenu />
        </div>
      </div>
    </header>
  )
}
