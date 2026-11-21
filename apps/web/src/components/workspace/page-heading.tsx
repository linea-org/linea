import { useMatches } from "@tanstack/react-router"
import { SidebarTrigger } from "@linealabs/ui/components/sidebar"
import { cn } from "@linealabs/ui/lib/utils"

import { TopBarBreadcrumb, useWorkspaceCrumbs } from "./top-bar-breadcrumb"
import { WorkflowHeading } from "./workflow-heading"

/** Where you are, above the page; the menu button only shows where the sidebar is hidden. */
export function PageHeading({
  slug,
  onActionsSlot,
}: Readonly<{
  slug: string
  onActionsSlot: (slot: HTMLElement | null) => void
}>) {
  const matches = useMatches()
  const workflow = matches.find(
    (match) => match.routeId === "/w/$slug/workflows/$workflowId/"
  )?.loaderData?.workflow
  // Home has its own heading, and Inky's tab already names the page.
  const untitled = matches.some(
    (match) =>
      match.routeId === "/w/$slug/" || match.routeId === "/w/$slug/assistant"
  )
  const crumbs = useWorkspaceCrumbs(slug)
  const hasTitle = workflow !== undefined || (!untitled && crumbs.length > 0)
  return (
    <div
      className={cn(
        "flex h-10.5 shrink-0 items-center gap-2 px-4 pt-2.5",
        !hasTitle && "md:hidden md:has-[[data-slot=page-toolbar]]:flex"
      )}
    >
      <SidebarTrigger size="icon-sm" className="md:hidden" />
      {workflow ? (
        <WorkflowHeading slug={slug} workflow={workflow} />
      ) : hasTitle ? (
        <TopBarBreadcrumb slug={slug} />
      ) : null}
      <div ref={onActionsSlot} className="ml-auto flex min-w-0 justify-end" />
    </div>
  )
}
