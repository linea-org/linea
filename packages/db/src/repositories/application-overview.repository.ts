import { sql } from "drizzle-orm"
import {
  agents,
  applications,
  environmentAgentBindings,
  environments,
  environmentWorkflowBindings,
  executions,
  secrets,
  signals,
  workflows,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type ApplicationEnvironmentHealth = {
  environment: "dev" | "production"
  enabled: boolean
  /** An enabled agent or workflow deployment is accepting requests. */
  live: boolean
}

export type ApplicationOverview = {
  applicationId: string
  environments: ApplicationEnvironmentHealth[]
  hasProviderKey: boolean
  openSignals: number
  /** UTC day (YYYY-MM-DD) → runs started that day, for the last seven days. */
  runsByDay: { day: string; count: number }[]
  lastRun: { at: string; status: string } | null
}

const ACTIVITY_DAYS = 7

/** One row per application in the workspace; every figure is scoped to that workspace. */
export async function listApplicationOverviews(
  db: DbClient,
  workspaceId: string,
  providerKeyNames: string[]
): Promise<ApplicationOverview[]> {
  const envRows = await db.execute<{
    applicationId: string
    environment: "dev" | "production"
    enabled: boolean
    live: boolean
  }>(sql`
    SELECT
      ${environments.applicationId} AS "applicationId",
      ${environments.environment} AS environment,
      ${environments.enabled} AS enabled,
      (
        EXISTS (
          SELECT 1 FROM ${environmentAgentBindings}
          WHERE ${environmentAgentBindings.environmentId} = ${environments.id}
            AND ${environmentAgentBindings.enabled}
        ) OR EXISTS (
          SELECT 1 FROM ${environmentWorkflowBindings}
          WHERE ${environmentWorkflowBindings.environmentId} = ${environments.id}
            AND ${environmentWorkflowBindings.enabled}
        )
      ) AS live
    FROM ${environments}
    WHERE ${environments.workspaceId} = ${workspaceId}
    ORDER BY ${environments.environment}
  `)

  const keyRows = await db.execute<{ applicationId: string }>(sql`
    SELECT DISTINCT ${environments.applicationId} AS "applicationId"
    FROM ${secrets}
    JOIN ${environments} ON ${environments.id} = ${secrets.environmentId}
    WHERE ${environments.workspaceId} = ${workspaceId}
      AND ${secrets.key} IN ${providerKeyNames}
  `)

  const signalRows = await db.execute<{
    applicationId: string
    count: number
  }>(sql`
    SELECT ${workflows.applicationId} AS "applicationId", count(*)::int AS count
    FROM ${signals}
    JOIN ${workflows} ON ${workflows.id} = ${signals.workflowId}
    WHERE ${signals.workspaceId} = ${workspaceId}
      AND ${signals.resolvedAt} IS NULL
    GROUP BY ${workflows.applicationId}
  `)

  // A run belongs to an application through its environment, workflow or agent, whichever it has.
  const runApplication = sql`coalesce(
    ${environments.applicationId}, ${workflows.applicationId}, ${agents.applicationId}
  )`
  const runFrom = sql`
    FROM ${executions}
    LEFT JOIN ${environments} ON ${environments.id} = ${executions.environmentId}
    LEFT JOIN ${workflows} ON ${workflows.id} = ${executions.workflowId}
    LEFT JOIN ${agents} ON ${agents.id} = ${executions.agentId}
    WHERE ${executions.workspaceId} = ${workspaceId}
  `
  const dayRows = await db.execute<{
    applicationId: string
    day: string
    count: number
  }>(sql`
    SELECT
      ${runApplication} AS "applicationId",
      to_char(${executions.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      count(*)::int AS count
    ${runFrom}
      AND ${executions.createdAt} >= now() - make_interval(days => ${ACTIVITY_DAYS})
    GROUP BY 1, 2
  `)
  const lastRows = await db.execute<{
    applicationId: string
    at: string
    status: string
  }>(sql`
    SELECT DISTINCT ON (${runApplication})
      ${runApplication} AS "applicationId",
      ${executions.createdAt} AS at,
      ${executions.status} AS status
    ${runFrom}
    ORDER BY ${runApplication}, ${executions.createdAt} DESC
  `)

  const appRows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(sql`${applications.workspaceId} = ${workspaceId}`)

  const keyed = new Set(keyRows.rows.map((row) => row.applicationId))
  return appRows.map(({ id }) => {
    const last = lastRows.rows.find((row) => row.applicationId === id)
    return {
      applicationId: id,
      environments: envRows.rows
        .filter((row) => row.applicationId === id)
        .map(({ environment, enabled, live }) => ({
          environment,
          enabled,
          live,
        })),
      hasProviderKey: keyed.has(id),
      openSignals:
        signalRows.rows.find((row) => row.applicationId === id)?.count ?? 0,
      runsByDay: dayRows.rows
        .filter((row) => row.applicationId === id)
        .map(({ day, count }) => ({ day, count })),
      lastRun: last
        ? { at: new Date(last.at).toISOString(), status: last.status }
        : null,
    }
  })
}
