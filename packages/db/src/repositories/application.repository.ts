import { and, desc, eq, getTableColumns, ne, sql } from "drizzle-orm"
import {
  agents,
  applications,
  environments,
  workflows,
  type Application,
  type NewApplication,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createApplication(
  db: DbClient,
  input: NewApplication
): Promise<Application> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .insert(applications)
      .values(input)
      .returning()
    await tx.insert(environments).values([
      {
        workspaceId: application.workspaceId,
        applicationId: application.id,
        environment: "dev",
        displayName: "Development",
      },
      {
        workspaceId: application.workspaceId,
        applicationId: application.id,
        environment: "production",
        displayName: "Production",
      },
    ])
    return application
  })
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if ("code" in error && error.code === "23505") return true
  return "cause" in error && isUniqueViolation(error.cause)
}

export type UpdateApplicationResult =
  | { outcome: "updated"; application: Application }
  | { outcome: "not_found" }
  | { outcome: "slug_taken" }

export async function updateApplication(
  db: DbClient,
  workspaceId: string,
  id: string,
  input: { name: string; slug: string }
): Promise<UpdateApplicationResult> {
  const [conflict] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.slug, input.slug),
        ne(applications.id, id)
      )
    )
    .limit(1)
  if (conflict) return { outcome: "slug_taken" }
  try {
    const [application] = await db
      .update(applications)
      .set(input)
      .where(
        and(eq(applications.workspaceId, workspaceId), eq(applications.id, id))
      )
      .returning()
    if (!application) return { outcome: "not_found" }
    return { outcome: "updated", application }
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "slug_taken" }
    throw error
  }
}

export async function getApplicationById(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<Application | undefined> {
  const [application] = await db
    .select()
    .from(applications)
    .where(
      and(eq(applications.workspaceId, workspaceId), eq(applications.id, id))
    )
  return application
}

export type ApplicationListItem = Application & {
  agentCount: number
  workflowCount: number
}

export async function listApplications(
  db: DbClient,
  workspaceId: string
): Promise<ApplicationListItem[]> {
  const rows = await db
    .select({
      ...getTableColumns(applications),
      // Drizzle drops the outer table qualifier inside sql``, so a column reference would bind to the inner table.
      agentCount: sql<number>`(
        select count(*)::int from ${agents}
        where ${agents.applicationId} = "applications"."id"
          and ${agents.archivedAt} is null
      )`,
      workflowCount: sql<number>`(
        select count(*)::int from ${workflows}
        where ${workflows.applicationId} = "applications"."id"
          and ${workflows.archivedAt} is null
      )`,
    })
    .from(applications)
    .where(eq(applications.workspaceId, workspaceId))
    .orderBy(desc(applications.createdAt))
  return rows.map((row) => ({
    ...row,
    agentCount: Number(row.agentCount),
    workflowCount: Number(row.workflowCount),
  }))
}
