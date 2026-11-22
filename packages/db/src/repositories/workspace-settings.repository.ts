import { eq } from "drizzle-orm"
import { workspaceSettings, type WorkspaceSettings } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function isBehaviourAnalysisEnabled(
  db: DbClient,
  workspaceId: string
): Promise<boolean> {
  const [settings] = await db
    .select({ enabled: workspaceSettings.behaviourAnalysisEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
  return settings?.enabled ?? false
}

export async function getOrCreateWorkspaceSettings(
  db: DbClient,
  workspaceId: string
): Promise<WorkspaceSettings> {
  const [existing] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
  if (existing) return existing

  const [created] = await db
    .insert(workspaceSettings)
    .values({ workspaceId })
    .onConflictDoNothing()
    .returning()
  // A concurrent first-read raced this insert and won — re-select rather than return undefined.
  if (created) return created

  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
  return row
}

export type UpdateWorkspaceSettingsInput = Partial<
  Pick<
    WorkspaceSettings,
    | "behaviourAnalysisEnabled"
    | "behaviourSampleRate"
    | "behaviourModel"
    | "defaultModel"
    | "judgeModel"
    | "stepModel"
    | "retentionDays"
    | "redactionRules"
  >
>

export async function updateWorkspaceSettings(
  db: DbClient,
  workspaceId: string,
  input: UpdateWorkspaceSettingsInput
): Promise<WorkspaceSettings> {
  if (
    input.behaviourSampleRate !== undefined &&
    (input.behaviourSampleRate < 0 || input.behaviourSampleRate > 1)
  ) {
    throw new Error(
      `behaviourSampleRate must be between 0 and 1, got ${input.behaviourSampleRate}`
    )
  }
  const [updated] = await db
    .insert(workspaceSettings)
    .values({ workspaceId, ...input })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { ...input, updatedAt: new Date() },
    })
    .returning()
  return updated
}
