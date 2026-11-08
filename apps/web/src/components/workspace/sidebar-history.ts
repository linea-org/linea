import { z } from "zod"
import { agentSectionSchema } from "@/components/agents/agent-sections"
import { environmentNameSchema } from "@/lib/environments-api"
import { workflowViewSchema } from "@/components/workflows/workflow-views"

export const sidebarContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("main"), pathname: z.string() }),
  z.object({
    kind: z.literal("application"),
    applicationId: z.uuid(),
    view: z.enum(["agents", "workflows", "environments"]),
    environment: environmentNameSchema,
    environments: z.array(environmentNameSchema),
  }),
  z.object({
    kind: z.literal("agent"),
    agentId: z.uuid(),
    section: agentSectionSchema,
    environment: environmentNameSchema,
    environments: z.array(environmentNameSchema),
  }),
  z.object({ kind: z.literal("workflows") }),
  z.object({
    kind: z.literal("workflow"),
    workflowId: z.uuid(),
    view: workflowViewSchema.nullable(),
  }),
  z.object({
    kind: z.literal("executions"),
    view: z.enum(["history", "approvals"]),
  }),
])

export type SidebarContext = z.infer<typeof sidebarContextSchema>
export const sidebarTrailSchema = z
  .tuple([sidebarContextSchema])
  .rest(sidebarContextSchema)
export type Trail = z.infer<typeof sidebarTrailSchema>

export type SidebarHistory = {
  locationKey: string
  trail: Trail
  visits: Map<string, Trail>
  expanded: Record<string, boolean>
}

export function sidebarContextKey(context: SidebarContext) {
  switch (context.kind) {
    case "application":
      return `application:${context.applicationId}`
    case "agent":
      return `agent:${context.agentId}`
    case "workflow":
      return `workflow:${context.workflowId}`
    case "main":
    case "workflows":
    case "executions":
      return context.kind
    default: {
      const unreachable: never = context
      return unreachable
    }
  }
}

export function createSidebarHistory(
  locationKey: string,
  context: SidebarContext,
  workspacePath: string
): SidebarHistory {
  const trail: Trail =
    context.kind === "main"
      ? [context]
      : [context, { kind: "main", pathname: workspacePath }]
  return {
    locationKey,
    trail,
    visits: new Map([[locationKey, trail]]),
    expanded: {},
  }
}

export function visitSidebarContext(
  history: SidebarHistory,
  locationKey: string,
  context: SidebarContext
): SidebarHistory {
  const previousVisit = history.visits.get(locationKey)
  const trail: Trail =
    previousVisit ??
    (sidebarContextKey(history.trail[0]) === sidebarContextKey(context)
      ? [context, ...history.trail.slice(1)]
      : [context, ...history.trail])
  return {
    ...history,
    locationKey,
    trail,
    visits: new Map(history.visits).set(locationKey, trail),
  }
}

export function restoreSidebarState(
  history: SidebarHistory,
  trail: Trail,
  expanded: Record<string, boolean>
): SidebarHistory {
  return {
    ...history,
    trail,
    expanded,
    visits: new Map(history.visits).set(history.locationKey, trail),
  }
}

export function rewindSidebar(history: SidebarHistory): SidebarHistory {
  const previous = history.trail[1]
  if (!previous) return history
  const trail: Trail = [previous, ...history.trail.slice(2)]
  return {
    ...history,
    trail,
    visits: new Map(history.visits).set(history.locationKey, trail),
  }
}

export function backTarget(history: SidebarHistory): string | null {
  const [, previous, deeper] = history.trail
  return previous?.kind === "main" && !deeper ? previous.pathname : null
}

export function leaveToMain(history: SidebarHistory): SidebarHistory {
  const previous = history.trail[1]
  return previous ? { ...history, trail: [previous] } : history
}
