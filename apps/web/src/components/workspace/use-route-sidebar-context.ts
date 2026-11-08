import { useLocation, useMatch, useMatches } from "@tanstack/react-router"
import type { SidebarContext } from "./sidebar-history"

type Kind<K extends SidebarContext["kind"]> = Extract<
  SidebarContext,
  { kind: K }
>

type AgentMatch = {
  params: { agentId: string }
  search: {
    section?: Kind<"agent">["section"]
    environment?: Kind<"agent">["environment"]
  }
  loaderData?: { environments: { environment: Kind<"agent">["environment"] }[] }
}

type ApplicationMatch = {
  params: { applicationId: string }
  search: {
    view?: Kind<"application">["view"]
    environment?: Kind<"application">["environment"]
  }
  loaderData?: {
    environments: { environment: Kind<"application">["environment"] }[]
  }
}

type SearchRecord = Record<string, unknown>

function agentContext(match: AgentMatch): Kind<"agent"> {
  return {
    kind: "agent",
    agentId: match.params.agentId,
    section: match.search.section ?? "configuration",
    environment: match.search.environment ?? "dev",
    environments:
      match.loaderData?.environments.map((item) => item.environment) ?? [],
  }
}

function applicationContext(match: ApplicationMatch): Kind<"application"> {
  return {
    kind: "application",
    applicationId: match.params.applicationId,
    view: match.search.view ?? "agents",
    environment: match.search.environment ?? "dev",
    environments:
      match.loaderData?.environments.map((item) => item.environment) ?? [],
  }
}

function pathContext(slug: string, pathname: string): SidebarContext {
  if (pathname.startsWith(`/w/${slug}/workflows`)) return { kind: "workflows" }
  if (
    pathname.startsWith(`/w/${slug}/executions`) ||
    pathname === `/w/${slug}/approvals`
  ) {
    return {
      kind: "executions",
      view: pathname.endsWith("/approvals") ? "approvals" : "history",
    }
  }
  return { kind: "main", pathname }
}

function searchDefaults(
  agent: boolean,
  application: boolean
): Record<string, string> {
  if (agent) return { section: "configuration", environment: "dev" }
  if (application) return { view: "agents", environment: "dev" }
  return { view: "executions" }
}

/** Whether the URL's search params have caught up with the matched route's. */
function sameSearch(
  matched: SearchRecord | undefined,
  current: SearchRecord,
  defaults: Record<string, string>
): boolean {
  if (!matched) return true
  return Object.entries(defaults).every(
    ([key, fallback]) =>
      (matched[key] ?? fallback) === (current[key] ?? fallback)
  )
}

export function useRouteSidebarContext(slug: string) {
  const location = useLocation()
  const leaf = useMatches().at(-1)
  const application = useMatch({
    from: "/w/$slug/applications/$applicationId",
    shouldThrow: false,
  })
  const agent = useMatch({
    from: "/w/$slug/agents/$agentId",
    shouldThrow: false,
  })
  const workflow = useMatch({
    from: "/w/$slug/workflows/$workflowId",
    shouldThrow: false,
  })
  const workflowView = useMatch({
    from: "/w/$slug/workflows/$workflowId/",
    shouldThrow: false,
  })
  let context: SidebarContext
  if (agent) context = agentContext(agent)
  else if (application) context = applicationContext(application)
  else if (workflow)
    context = {
      kind: "workflow",
      workflowId: workflow.params.workflowId,
      view: workflowView ? (workflowView.search.view ?? "executions") : null,
    }
  else context = pathContext(slug, location.pathname)
  const searchMatches = sameSearch(
    (agent ?? application ?? workflowView)?.search,
    location.search,
    searchDefaults(Boolean(agent), Boolean(application))
  )
  // URL changes can precede route matches; commit the menu with the page.
  const ready =
    leaf?.pathname.replace(/\/$/, "") ===
      location.pathname.replace(/\/$/, "") && searchMatches
  const locationKey = location.state.__TSR_key ?? location.href
  return { context, locationKey, ready }
}
