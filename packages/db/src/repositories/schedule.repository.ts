import { and, eq, lte } from "drizzle-orm"
import { schedules, type Schedule } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getDueSchedules(
  db: DbClient,
  now: Date = new Date()
): Promise<Schedule[]> {
  return db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)))
}

export async function advanceSchedule(
  db: DbClient,
  scheduleId: string,
  nextRunAt: Date
): Promise<void> {
  await db
    .update(schedules)
    .set({ nextRunAt, lastRunAt: new Date() })
    .where(eq(schedules.id, scheduleId))
}
