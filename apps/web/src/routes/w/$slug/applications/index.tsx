import { useEffect, useRef, useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  LayoutGridIcon,
  ListFilterIcon,
  ListIcon,
  PlusIcon,
} from "lucide-react"
import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { Tabs, TabsList, TabsTrigger } from "@linea/ui/components/tabs"
import { cn } from "@linea/ui/lib/utils"
import { PlayfulAvatar } from "@/components/avatar"
import { ApplicationCardMenu } from "@/components/applications/application-rename-popover"
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog"
import { AddAgentDialog } from "@/components/agents/add-agent-dialog"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { ToolbarSearch } from "@/components/workspace/toolbar-search"
import {
  applicationsQueryOptions,
  listApplicationsFn,
  type ApplicationSummary,
} from "@/lib/applications-api"

export const Route = createFileRoute("/w/$slug/applications/")({
  loader: () => listApplicationsFn(),
  component: ApplicationsPage,
})

type ApplicationSort = "updated" | "name"
type ApplicationView = "grid" | "list"

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

function ApplicationsPage() {
  const { slug } = Route.useParams()
  const { data: applications } = useSuspenseQuery({
    ...applicationsQueryOptions(slug),
    initialData: Route.useLoaderData(),
  })
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<ApplicationSort>("updated")
  const [view, setView] = useState<ApplicationView>("grid")
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return
      }
      event.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])
  const normalizedQuery = query.trim().toLowerCase()
  const visible = applications
    .filter((application) =>
      `${application.name} ${application.slug}`
        .toLowerCase()
        .includes(normalizedQuery)
    )
    .sort((left, right) =>
      sort === "name"
        ? left.name.localeCompare(right.name)
        : new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
    )
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PageToolbar>
        <ToolbarSearch
          inputRef={searchRef}
          value={query}
          onChange={setQuery}
          placeholder="Search Applications"
          shortcut="/"
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label="Filter applications"
              />
            }
          >
            <ListFilterIcon />
            Filter
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-max max-w-64 min-w-(--anchor-width)"
          >
            <DropdownMenuItem
              className="truncate"
              onClick={() => setSort("updated")}
            >
              Recently updated
            </DropdownMenuItem>
            <DropdownMenuItem
              className="truncate"
              onClick={() => setSort("name")}
            >
              Name
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tabs
          value={view}
          onValueChange={(value: unknown) => {
            if (value === "grid" || value === "list") setView(value)
          }}
          className="w-fit gap-0"
        >
          <TabsList className="h-8!">
            <TabsTrigger value="grid" aria-label="Grid view">
              <LayoutGridIcon />
            </TabsTrigger>
            <TabsTrigger value="list" aria-label="List view">
              <ListIcon />
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <CreateApplicationDialog workspaceSlug={slug} />
          <AddAgentDialog
            workspaceSlug={slug}
            trigger={
              <Button size="xs">
                <PlusIcon />
                Add Agent
              </Button>
            }
          />
        </div>
      </PageToolbar>
      {applications.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Add your first Agent</EmptyTitle>
            <EmptyDescription>
              Start with an Agent and create its Application in the same flow.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visible.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          No Applications match that search.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((application) => (
            <ApplicationCard
              key={application.id}
              slug={slug}
              application={application}
              layout="grid"
            />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/70 border-b border-border/70">
          {visible.map((application) => (
            <ApplicationCard
              key={application.id}
              slug={slug}
              application={application}
              layout="list"
            />
          ))}
        </div>
      )}
    </main>
  )
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function ApplicationCard({
  slug,
  application,
  layout,
}: {
  slug: string
  application: ApplicationSummary
  layout: ApplicationView
}) {
  const updated = formatDate(application.updatedAt)
  const summary = `${countLabel(application.agentCount, "Agent", "Agents")} · ${countLabel(application.workflowCount, "Workflow", "Workflows")}`
  return (
    <div
      className={cn(
        "hover:bg-muted/40",
        layout === "grid"
          ? "relative rounded-lg border border-border/70"
          : "flex items-center"
      )}
    >
      <Link
        to="/w/$slug/applications/$applicationId"
        params={{ slug, applicationId: application.id }}
        className={
          layout === "grid"
            ? "flex flex-col gap-3 p-3 pr-10"
            : "flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <PlayfulAvatar
            name={application.name}
            shape="rounded"
            className="size-8"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xs font-medium">{application.name}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {application.slug}
            </p>
          </div>
        </div>
        {layout === "grid" ? (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p className="truncate">{summary}</p>
            <p className="shrink-0 tabular-nums">{updated}</p>
          </div>
        ) : (
          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <p className="truncate">{summary}</p>
            <p className="shrink-0 tabular-nums">{updated}</p>
          </div>
        )}
      </Link>
      <div
        className={layout === "grid" ? "absolute top-2.5 right-2.5" : "pr-2"}
      >
        <ApplicationCardMenu workspaceSlug={slug} application={application} />
      </div>
    </div>
  )
}
