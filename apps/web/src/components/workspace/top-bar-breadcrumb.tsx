import { Fragment } from "react"
import { Link, useMatches, useNavigate } from "@tanstack/react-router"

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@linea/ui/components/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"

type Crumb =
  | {
      label: string
      to: string
      params: Record<string, string>
      search?: { view: "agents" | "workflows" | "environments" }
    }
  | { label: string }

const useRouteMatches = () => useMatches()
type RouteMatch = ReturnType<typeof useRouteMatches>[number]

function applicationsCrumb(slug: string): Crumb {
  return {
    label: "Applications",
    to: "/w/$slug/applications",
    params: { slug },
  }
}

function workflowsCrumb(slug: string): Crumb {
  return { label: "Workflows", to: "/w/$slug/workflows", params: { slug } }
}

function executionsCrumb(slug: string): Crumb {
  return { label: "Executions", to: "/w/$slug/executions", params: { slug } }
}

function crumbsForMatch(match: RouteMatch, slug: string): Crumb[] {
  switch (match.routeId) {
    case "/w/$slug/agents/new":
      return [applicationsCrumb(slug), { label: "Add Agent" }]
    case "/w/$slug/applications/":
      return [{ label: "Applications" }]
    case "/w/$slug/applications/$applicationId": {
      const { applicationId } = match.params
      const application = match.loaderData?.applications.find(
        (item) => item.id === applicationId
      )
      return [
        applicationsCrumb(slug),
        { label: application?.name ?? "Application" },
      ]
    }
    case "/w/$slug/agents/$agentId": {
      const data = match.loaderData
      if (!data) return [applicationsCrumb(slug)]
      return [
        applicationsCrumb(slug),
        {
          label: data.application.name,
          to: "/w/$slug/applications/$applicationId",
          params: { slug, applicationId: data.application.id },
          search: { view: "agents" },
        },
        { label: data.agent.name },
      ]
    }
    case "/w/$slug/":
      return [{ label: "Home" }]
    case "/w/$slug/workflows/":
      return [workflowsCrumb(slug)]
    case "/w/$slug/executions/":
      return [executionsCrumb(slug)]
    case "/w/$slug/workflows/$workflowId/": {
      const workflow = match.loaderData?.workflow
      return [
        ...(workflow
          ? [
              {
                label: "Application",
                to: "/w/$slug/applications/$applicationId",
                params: { slug, applicationId: workflow.applicationId },
                search: { view: "workflows" },
              } satisfies Crumb,
            ]
          : []),
        {
          label: workflow?.name ?? "Workflow",
          to: "/w/$slug/workflows/$workflowId",
          params: { slug, workflowId: match.params.workflowId },
        },
      ]
    }
    case "/w/$slug/executions/$executionId":
      return [
        executionsCrumb(slug),
        { label: match.loaderData?.workflow?.name ?? "Execution" },
      ]
    case "/w/$slug/workflows/$workflowId/executions/$executionId":
      return [
        workflowsCrumb(slug),
        {
          label: match.loaderData?.workflow?.name ?? "Workflow",
          to: "/w/$slug/workflows/$workflowId",
          params: { slug, workflowId: match.params.workflowId },
        },
        { label: "Execution" },
      ]
    case "/w/$slug/approvals": {
      const executionId = match.search.executionId
      return [
        ...(executionId
          ? [
              {
                label: "Execution",
                to: "/w/$slug/executions/$executionId",
                params: { slug, executionId },
              } satisfies Crumb,
            ]
          : []),
        { label: "Approvals" },
      ]
    }
    case "/w/$slug/notifications":
      return [{ label: "Notifications" }]
    case "/w/$slug/settings/":
      return [{ label: "Settings" }]
    case "/w/$slug/settings/members":
      return [{ label: "Members" }]
    case "/w/$slug/settings/secrets":
      return [{ label: "Secrets" }]
    case "/w/$slug/workflows/$workflowId/builder":
      return [
        workflowsCrumb(slug),
        {
          label: match.loaderData?.workflow?.name ?? "Workflow",
          to: "/w/$slug/workflows/$workflowId",
          params: { slug, workflowId: match.params.workflowId },
        },
        { label: "Builder" },
      ]
    default:
      return []
  }
}

export function useWorkspaceCrumbs(slug: string): Crumb[] {
  return useRouteMatches().flatMap((match) => crumbsForMatch(match, slug))
}

function CrumbText({ label }: { label: string }) {
  return (
    <span className="block max-w-40 truncate" title={label}>
      {label}
    </span>
  )
}

function CrumbItem({ crumb, current }: { crumb: Crumb; current: boolean }) {
  if ("to" in crumb && !current) {
    return (
      <BreadcrumbLink
        className="min-w-0"
        render={
          <Link to={crumb.to} params={crumb.params} search={crumb.search} />
        }
      >
        <CrumbText label={crumb.label} />
      </BreadcrumbLink>
    )
  }
  return (
    <BreadcrumbPage className="min-w-0">
      <CrumbText label={crumb.label} />
    </BreadcrumbPage>
  )
}

function HiddenCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const navigate = useNavigate()
  return (
    <BreadcrumbItem>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center outline-none">
          <BreadcrumbEllipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-40">
          {crumbs.map((crumb, index) => (
            <DropdownMenuItem
              key={`${crumb.label}-${index}`}
              className="cursor-pointer"
              disabled={!("to" in crumb)}
              onClick={() => {
                if ("to" in crumb) {
                  void navigate({
                    to: crumb.to,
                    params: crumb.params,
                    search: crumb.search,
                  })
                }
              }}
            >
              <span className="truncate">{crumb.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </BreadcrumbItem>
  )
}

export function TopBarBreadcrumb({ slug }: { slug: string }) {
  const crumbs = useWorkspaceCrumbs(slug)
  if (crumbs.length === 0) {
    return null
  }
  const first = crumbs[0]
  const last = crumbs.at(-1)
  if (!first || !last) {
    return null
  }
  const collapsed = crumbs.length >= 3
  const visible = collapsed ? [first, last] : crumbs
  const hidden = collapsed ? crumbs.slice(1, -1) : []
  return (
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap">
        {visible.map((crumb, index) => (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? <BreadcrumbSeparator className="shrink-0" /> : null}
            {index === 1 && hidden.length > 0 ? (
              <>
                <HiddenCrumbs crumbs={hidden} />
                <BreadcrumbSeparator className="shrink-0" />
              </>
            ) : null}
            <BreadcrumbItem className="min-w-0">
              <CrumbItem crumb={crumb} current={index === visible.length - 1} />
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
