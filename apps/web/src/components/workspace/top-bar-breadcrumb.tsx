import { Fragment } from "react"
import { Link, useMatches } from "@tanstack/react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@linea/ui/components/breadcrumb"

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
  }

  return crumbs
}

export function TopBarBreadcrumb({ slug }: { slug: string }) {
  const crumbs = useBreadcrumbs(slug)

  if (crumbs.length === 0) {
    return null
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={index}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {"to" in crumb && index < crumbs.length - 1 ? (
                <BreadcrumbLink
                  render={<Link to={crumb.to} params={crumb.params} />}
                >
                  {crumb.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
