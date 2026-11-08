import { useEffect, useRef, useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  BotIcon,
  BoxesIcon,
  LayoutGridIcon,
  ListFilterIcon,
  ListIcon,
  PlusIcon,
  WorkflowIcon,
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
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"
import { Tabs, TabsList, TabsTrigger } from "@linea/ui/components/tabs"
import { PlayfulAvatar } from "@/components/avatar"
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog"
import { ApplicationCardMenu } from "@/components/applications/application-rename-popover"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { ToolbarSearch } from "@/components/workspace/toolbar-search"
import {
  applicationsQueryOptions,
  listApplicationsFn,
  type ApplicationSummary,
} from "@/lib/applications-api"
import { formatDate } from "@/lib/format"

export const Route = createFileRoute("/w/$slug/applications/")({
  loader: () => listApplicationsFn(),
  component: ApplicationsPage,
})

type ApplicationSort = "updated" | "name"
type ApplicationView = "grid" | "list"

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
  function renderApplications() {
    if (applications.length === 0) {
      return (
        <Empty className="mx-4 my-2 w-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>Add your first Agent</EmptyTitle>
            <EmptyDescription>
              Start with an Agent and create its Application in the same flow.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }
    if (visible.length === 0) {
      return (
        <Empty className="mx-4 my-2 w-auto">
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
        <div className="grid grid-cols-1 gap-3 px-4 pt-2 pb-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((application) => (
            <ApplicationCard
              key={application.id}
              slug={slug}
              application={application}
            />
          ))}
        </div>
      )
    }
    return (
      <div className="px-4 py-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 font-normal text-muted-foreground">
                  Application
                </TableHead>
                <TableHead className="px-4 font-normal text-muted-foreground">
                  Agents
                </TableHead>
                <TableHead className="px-4 font-normal text-muted-foreground">
                  Workflows
                </TableHead>
                <TableHead className="px-4 font-normal text-muted-foreground">
                  Updated
                </TableHead>
                <TableHead className="w-12 px-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((application) => (
                <TableRow key={application.id} className="hover:bg-muted/40">
                  <TableCell className="px-4 py-3">
                    <Link
                      to="/w/$slug/applications/$applicationId"
                      params={{ slug, applicationId: application.id }}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <PlayfulAvatar
                        name={application.name}
                        shape="rounded"
                        className="size-8"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {application.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {application.slug}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                    {application.agentCount}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                    {application.workflowCount}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatDate(application.updatedAt)}
                  </TableCell>
                  <TableCell className="px-2 py-3 text-right">
                    <ApplicationCardMenu
                      workspaceSlug={slug}
                      application={application}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }
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
          <CreateApplicationDialog
            workspaceSlug={slug}
            trigger={
              <Button size="xs" variant="outline">
                <PlusIcon />
                Create Application
              </Button>
            }
          />
          <Button
            size="xs"
            render={<Link to="/w/$slug/agents/new" params={{ slug }} />}
          >
            <PlusIcon />
            Add Agent
          </Button>
        </div>
      </PageToolbar>
      {renderApplications()}
    </main>
  )
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function ApplicationCard({
  slug,
  application,
}: Readonly<{
  slug: string
  application: ApplicationSummary
}>) {
  return (
    <div className="group relative rounded-lg border border-border bg-card transition-colors hover:border-foreground/20 hover:bg-muted/40">
      <Link
        to="/w/$slug/applications/$applicationId"
        params={{ slug, applicationId: application.id }}
        className="flex flex-col"
      >
        <div className="flex min-w-0 items-center gap-3 px-4 py-5 pr-12">
          <PlayfulAvatar
            name={application.name}
            shape="rounded"
            className="size-10"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">{application.name}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {application.slug}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <BotIcon className="size-3.5" />
              {countLabel(application.agentCount, "Agent", "Agents")}
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <WorkflowIcon className="size-3.5" />
              {countLabel(application.workflowCount, "Workflow", "Workflows")}
            </span>
          </div>
          <p className="shrink-0 tabular-nums">
            {formatDate(application.updatedAt)}
          </p>
        </div>
      </Link>
      <div className="absolute top-[15px] right-3">
        <ApplicationCardMenu workspaceSlug={slug} application={application} />
      </div>
    </div>
  )
}
