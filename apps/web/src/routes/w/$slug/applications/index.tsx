import { useState } from "react"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  LayoutGridIcon,
  ListFilterIcon,
  ListIcon,
  WorkflowIcon,
} from "lucide-react"
import { Button } from "@linealabs/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"
import { Tabs, TabsList, TabsTrigger } from "@linealabs/ui/components/tabs"
import { Badge } from "@linealabs/ui/components/badge"
import { Card } from "@linealabs/ui/components/card"
import { PlayfulAvatar } from "@/components/avatar"
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog"
import { ApplicationCardMenu } from "@/components/applications/application-rename-popover"
import {
  EnvironmentPills,
  RecentActivity,
  SetupProgress,
  setupChecks,
} from "@/components/applications/application-health"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { ShortcutTooltip } from "@/components/shortcuts/shortcut-tooltip"
import { useOpenShortcut } from "@/components/shortcuts/use-open-shortcut"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { SortableTableHead } from "@/components/workspace/sortable-table-head"
import { useTableSort } from "@/components/workspace/use-table-sort"
import type { Sort } from "@/lib/sort"
import { ToolbarSearch } from "@/components/workspace/toolbar-search"
import {
  applicationOverviewsQueryOptions,
  applicationsQueryOptions,
  type ApplicationOverview,
  listApplicationsFn,
  type ApplicationSummary,
} from "@/lib/applications-api"
import { formatDate } from "@/lib/format"

export const Route = createFileRoute("/w/$slug/applications/")({
  loader: () => listApplicationsFn(),
  component: ApplicationsPage,
})

type ApplicationSortColumn = "name" | "agents" | "workflows" | "updated"
type ApplicationView = "grid" | "list"

function ApplicationsPage() {
  const { slug } = Route.useParams()
  const { data: applications } = useSuspenseQuery({
    ...applicationsQueryOptions(slug),
    initialData: Route.useLoaderData(),
  })
  const overviews = useQuery(applicationOverviewsQueryOptions(slug))
  const [query, setQuery] = useState("")
  const [filterOpen, setFilterOpen] = useOpenShortcut("filter")
  const [view, setView] = useState<ApplicationView>("grid")
  const normalizedQuery = query.trim().toLowerCase()
  const {
    sorted: visible,
    sorts,
    setSorts,
    onSort,
  } = useTableSort<ApplicationSummary, ApplicationSortColumn>(
    applications
      .filter((application) =>
        `${application.name} ${application.slug}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .sort(byRecentlyUpdated),
    applicationSortValue,
    byRecentlyUpdated
  )
  const quickSort = quickSortOf(sorts)
  function renderApplications() {
    if (applications.length === 0) {
      return (
        <Empty className="w-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>Add your first Agent</EmptyTitle>
            <EmptyDescription>Create an Agent to start one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }
    if (visible.length === 0) {
      return (
        <Empty className="w-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>No matching Applications</EmptyTitle>
            <EmptyDescription>
              Try another name or clear your search.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }
    if (view === "grid") {
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((application) => (
            <ApplicationCard
              key={application.id}
              slug={slug}
              application={application}
              overview={overviews.data?.find(
                (item) => item.applicationId === application.id
              )}
            />
          ))}
        </div>
      )
    }
    return (
      <div>
        <Card className="gap-0 py-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <SortableTableHead
                  column="name"
                  label="Application"
                  sorts={sorts}
                  onSort={onSort}
                />
                <SortableTableHead
                  column="agents"
                  label="Agents"
                  sorts={sorts}
                  onSort={onSort}
                />
                <SortableTableHead
                  column="workflows"
                  label="Workflows"
                  sorts={sorts}
                  onSort={onSort}
                />
                <SortableTableHead
                  column="updated"
                  label="Updated"
                  sorts={sorts}
                  onSort={onSort}
                />
                <TableHead className="w-12 px-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="px-4">
                    <Link
                      to="/w/$slug/applications/$applicationId"
                      params={{ slug, applicationId: application.id }}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <PlayfulAvatar
                        name={application.name}
                        shape="rounded"
                        className="size-6"
                      />
                      <span className="truncate text-sm font-medium">
                        {application.name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums">
                    {application.agentCount}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums">
                    {application.workflowCount}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums">
                    {formatDate(application.updatedAt)}
                  </TableCell>
                  <TableCell className="px-2 text-right">
                    <ApplicationCardMenu
                      workspaceSlug={slug}
                      application={application}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    )
  }
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
      <PageToolbar>
        <ToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search Applications"
        />
        <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
          <ShortcutTooltip id="filter" label="Filter" disabled={filterOpen}>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Filter applications"
                />
              }
            >
              <ListFilterIcon />
            </DropdownMenuTrigger>
          </ShortcutTooltip>
          <DropdownMenuContent
            align="start"
            className="w-max max-w-64 min-w-(--anchor-width)"
          >
            <DropdownMenuRadioGroup
              value={quickSort}
              onValueChange={(value) => {
                setSorts(
                  value === "name" ? [{ column: "name", direction: "asc" }] : []
                )
                setFilterOpen(false)
              }}
            >
              <DropdownMenuRadioItem value="updated">
                Recently updated
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
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
        <div className="flex items-center gap-2">
          <CreateApplicationDialog
            workspaceSlug={slug}
            trigger={
              <Button variant="outline" size="sm" {...shortcutTarget("create")}>
                Create Application
                <ShortcutKeys id="create" />
              </Button>
            }
          />
          <Button
            nativeButton={false}
            render={<Link to="/w/$slug/agents/new" params={{ slug }} />}
            {...shortcutTarget("add-agent")}
          >
            Add Agent
            <ShortcutKeys id="add-agent" onPrimary />
          </Button>
        </div>
      </PageToolbar>
      {renderApplications()}
    </main>
  )
}

/** The sort menu's choice that matches the column sort, or none when columns were mixed. */
function quickSortOf(sorts: Sort<ApplicationSortColumn>[]) {
  if (sorts.length === 0) return "updated"
  const [only] = sorts
  if (sorts.length === 1 && only.column === "name" && only.direction === "asc")
    return "name"
  return ""
}

function byRecentlyUpdated(
  left: ApplicationSummary,
  right: ApplicationSummary
) {
  return right.updatedAt.localeCompare(left.updatedAt)
}

function applicationSortValue(
  application: ApplicationSummary,
  column: ApplicationSortColumn
): string | number {
  switch (column) {
    case "name":
      return application.name.toLowerCase()
    case "agents":
      return application.agentCount
    case "workflows":
      return application.workflowCount
    case "updated":
      return new Date(application.updatedAt).getTime()
    default: {
      const unreachable: never = column
      return unreachable
    }
  }
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function ApplicationCard({
  slug,
  application,
  overview,
}: Readonly<{
  slug: string
  application: ApplicationSummary
  overview: ApplicationOverview | undefined
}>) {
  return (
    <Card className="group relative gap-0 py-0">
      <Link
        to="/w/$slug/applications/$applicationId"
        params={{ slug, applicationId: application.id }}
        className="flex flex-col"
      >
        <div className="flex min-w-0 items-center gap-3 px-3 pt-3 pr-11">
          <PlayfulAvatar
            name={application.name}
            shape="rounded"
            className="size-10"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="truncate text-base font-medium">
              {application.name}
            </h2>
            {overview ? (
              <EnvironmentPills environments={overview.environments} />
            ) : null}
          </div>
        </div>
        {overview ? (
          <div className="px-3 py-3">
            <SetupProgress checks={setupChecks(application, overview)} />
          </div>
        ) : (
          <div className="h-4" />
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="secondary">
              <BotIcon />
              {countLabel(application.agentCount, "Agent", "Agents")}
            </Badge>
            <Badge variant="secondary">
              <WorkflowIcon />
              {countLabel(application.workflowCount, "Workflow", "Workflows")}
            </Badge>
            {overview && overview.openSignals > 0 ? (
              <Badge variant="warning">
                <ActivityIcon />
                {countLabel(overview.openSignals, "signal", "signals")}
              </Badge>
            ) : null}
          </div>
          {overview ? <RecentActivity overview={overview} /> : null}
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <ApplicationCardMenu workspaceSlug={slug} application={application} />
      </div>
    </Card>
  )
}
