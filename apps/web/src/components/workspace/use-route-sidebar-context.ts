import { useLocation, useMatch, useMatches } from "@tanstack/react-router"
import type { SidebarContext } from "./sidebar-history"

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
  const context: SidebarContext = agent
    ? {
        kind: "agent",
        agentId: agent.params.agentId,
        section: agent.search.section ?? "configuration",
        environment: agent.search.environment ?? "dev",
        environments:
          agent.loaderData?.environments.map((item) => item.environment) ?? [],
      }
    : application
      ? {
          kind: "application",
          applicationId: application.params.applicationId,
          view: application.search.view ?? "agents",
          environment: application.search.environment ?? "dev",
          environments:
            application.loaderData?.environments.map(
              (item) => item.environment
            ) ?? [],
        }
      : workflow
        ? {
            kind: "workflow",
            workflowId: workflow.params.workflowId,
            view: workflowView
              ? (workflowView.search.view ?? "executions")
              : null,
          }
        : location.pathname.startsWith(`/w/${slug}/workflows`)
          ? { kind: "workflows" }
          : location.pathname.startsWith(`/w/${slug}/executions`) ||
              location.pathname === `/w/${slug}/approvals`
            ? {
                kind: "executions",
                view: location.pathname.endsWith("/approvals")
                  ? "approvals"
                  : "history",
              }
            : { kind: "main", pathname: location.pathname }
  const searchMatches = agent
    ? (agent.search.section ?? "configuration") ===
        (location.search.section ?? "configuration") &&
      (agent.search.environment ?? "dev") ===
        (location.search.environment ?? "dev")
    : application
      ? (application.search.view ?? "agents") ===
          (location.search.view ?? "agents") &&
        (application.search.environment ?? "dev") ===
          (location.search.environment ?? "dev")
      : workflowView
        ? (workflowView.search.view ?? "executions") ===
          (location.search.view ?? "executions")
        : true
  // URL changes can precede route matches; commit the menu with the page.
  const ready =
    leaf?.pathname.replace(/\/$/, "") ===
      location.pathname.replace(/\/$/, "") && searchMatches
  const locationKey = location.state.__TSR_key ?? location.href
  return { context, locationKey, ready }
}
