import { describe, expect, it } from "vitest"
import {
  createSidebarHistory,
  rewindSidebar,
  sidebarContextKey,
  visitSidebarContext,
  type SidebarContext,
} from "./sidebar-history"

const main: SidebarContext = {
  kind: "main",
  pathname: "/w/company/applications",
}
const application: SidebarContext = {
  kind: "application",
  applicationId: "b11b1100-0000-4000-8000-000000000001",
  view: "agents",
  environment: "dev",
  environments: ["dev", "production"],
}
const agent: SidebarContext = {
  kind: "agent",
  agentId: "b11b1100-0000-4000-8000-000000000002",
  section: "configuration",
  environment: "dev",
  environments: ["dev", "production"],
}

describe("sidebar history", () => {
  it("rewinds the visited menus while keeping the current browser entry", () => {
    let history = createSidebarHistory("main", main, "/w/company")
    history = visitSidebarContext(history, "app", application)
    history = visitSidebarContext(history, "agent", agent)
    history = visitSidebarContext(history, "executions", {
      kind: "executions",
      view: "history",
    })
    const previous = rewindSidebar(history)
    expect(previous.locationKey).toBe("executions")
    expect(previous.trail[0]).toEqual(agent)
    expect(rewindSidebar(previous).trail[0]).toEqual(application)
  })
  it("keeps section and environment changes inside one menu context", () => {
    let history = createSidebarHistory("app", application, "/w/company")
    history = visitSidebarContext(history, "agent", agent)
    history = visitSidebarContext(history, "production", {
      ...agent,
      section: "deployments",
      environment: "production",
    })
    expect(history.trail.map(sidebarContextKey)).toEqual([
      sidebarContextKey(agent),
      sidebarContextKey(application),
      "main",
    ])
    expect(history.trail[0]).toMatchObject({
      section: "deployments",
      environment: "production",
    })
  })
  it("restores the menu associated with browser Back and Forward entries", () => {
    let history = createSidebarHistory("main", main, "/w/company")
    history = visitSidebarContext(history, "app", application)
    history = visitSidebarContext(history, "agent", agent)
    history = rewindSidebar(history)
    history = visitSidebarContext(history, "app", application)
    expect(history.trail[0]).toEqual(application)
    history = visitSidebarContext(history, "agent", agent)
    expect(history.trail[0]).toEqual(application)
  })
  it("offers the workspace menu for a direct entry without navigating away", () => {
    const history = createSidebarHistory("direct", agent, "/w/company")
    const back = rewindSidebar(history)
    expect(back.locationKey).toBe("direct")
    expect(back.trail).toEqual([{ kind: "main", pathname: "/w/company" }])
    expect(rewindSidebar(back)).toBe(back)
  })
})
