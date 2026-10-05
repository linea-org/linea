import { and, desc, eq } from "drizzle-orm"
import {
  applications,
  environments,
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

export async function listApplications(
  db: DbClient,
  workspaceId: string
): Promise<Application[]> {
  return db
    .select()
    .from(applications)
    .where(eq(applications.workspaceId, workspaceId))
    .orderBy(desc(applications.createdAt))
}
