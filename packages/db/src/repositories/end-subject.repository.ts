import { endSubjects, type EndSubject } from "../schema/index.js"
import type { DbClient } from "./types.js"

export type UpsertEndSubjectInput = {
  workspaceId: string
  externalId: string
  label?: string
}

// First-sight upsert — called wherever an externalSubjectId lands on an execution or schedule.
// Never touches deletedAt: re-sighting an erased subject records their new activity without
// silently undoing an explicit erasure request.
export async function upsertEndSubject(
  db: DbClient,
  input: UpsertEndSubjectInput
): Promise<EndSubject> {
  const [endSubject] = await db
    .insert(endSubjects)
    .values({
      workspaceId: input.workspaceId,
      externalId: input.externalId,
      label: input.label,
    })
    .onConflictDoUpdate({
      target: [endSubjects.workspaceId, endSubjects.externalId],
      set: {
        lastSeenAt: new Date(),
        ...(input.label !== undefined ? { label: input.label } : {}),
      },
    })
    .returning()
  return endSubject
}
