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
  | { label: string; to: string; params: Record<string, string> }
  | { label: string }

function useBreadcrumbs(slug: string): Crumb[] {
  const matches = useMatches()
  const crumbs: Crumb[] = []
  for (const match of matches) {
    if (match.routeId === "/w/$slug/") {
      crumbs.push({ label: "Home" })
    }
    if (match.routeId === "/w/$slug/workflows/") {
      crumbs.push({
        label: "Workflows",
        to: "/w/$slug/workflows",
        params: { slug },
      })
    }
    if (match.routeId === "/w/$slug/executions/") {
      crumbs.push({
        label: "Executions",
        to: "/w/$slug/executions",
        params: { slug },
      })
    }
    if (match.routeId === "/w/$slug/workflows/$workflowId/") {
      const workflowId = match.params.workflowId
      crumbs.push({
        label: "Workflows",
        to: "/w/$slug/workflows",
        params: { slug },
      })
      crumbs.push({
        label: match.loaderData?.workflow.name ?? "Workflow",
        to: "/w/$slug/workflows/$workflowId",
        params: { slug, workflowId },
      })
    }
    if (match.routeId === "/w/$slug/executions/$executionId") {
      crumbs.push({
        label: "Executions",
        to: "/w/$slug/executions",
        params: { slug },
      })
      crumbs.push({
        label: match.loaderData?.workflow?.name ?? "Execution",
      })
    }
    if (
      match.routeId === "/w/$slug/workflows/$workflowId/executions/$executionId"
    ) {
      const workflowId = match.params.workflowId
      crumbs.push({
        label: "Workflows",
        to: "/w/$slug/workflows",
        params: { slug },
      })
      crumbs.push({
        label: match.loaderData?.workflow?.name ?? "Workflow",
        to: "/w/$slug/workflows/$workflowId",
        params: { slug, workflowId },
      })
      crumbs.push({ label: "Execution" })
    }
    if (match.routeId === "/w/$slug/notifications") {
      crumbs.push({ label: "Notifications" })
    }
    if (match.routeId === "/w/$slug/settings/") {
      crumbs.push({ label: "Settings" })
    }
    if (match.routeId === "/w/$slug/settings/members") {
      crumbs.push({ label: "Members" })
    }
    if (match.routeId === "/w/$slug/settings/secrets") {
      crumbs.push({ label: "Secrets" })
    }
    if (match.routeId === "/w/$slug/workflows/$workflowId/builder") {
      const workflowId = match.params.workflowId
      crumbs.push({
        label: "Workflows",
        to: "/w/$slug/workflows",
        params: { slug },
      })
      crumbs.push({
        label: match.loaderData?.workflow?.name ?? "Workflow",
        to: "/w/$slug/workflows/$workflowId",
        params: { slug, workflowId },
      })
      crumbs.push({ label: "Builder" })
    }
  }
  return crumbs
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
      <BreadcrumbLink render={<Link to={crumb.to} params={crumb.params} />}>
        <CrumbText label={crumb.label} />
      </BreadcrumbLink>
    )
  }
  return (
    <BreadcrumbPage>
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
                  void navigate({ to: crumb.to, params: crumb.params })
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
  const crumbs = useBreadcrumbs(slug)
  if (crumbs.length === 0) {
    return null
  }
  const first = crumbs[0]
  const last = crumbs[crumbs.length - 1]
  if (!first || !last) {
    return null
  }
  const collapsed = crumbs.length > 3
  const visible = collapsed ? [first, last] : crumbs
  const hidden = collapsed ? crumbs.slice(1, -1) : []
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {visible.map((crumb, index) => (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            {index === 1 && hidden.length > 0 ? (
              <>
                <HiddenCrumbs crumbs={hidden} />
                <BreadcrumbSeparator />
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
