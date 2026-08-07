import { and, eq, lte } from "drizzle-orm"
import { CronExpressionParser } from "cron-parser"
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

function computeNextRunAt(
  cronExpression: string,
  timezone: string,
  currentDate: Date
): Date {
  return CronExpressionParser.parse(cronExpression, {
    currentDate,
    tz: timezone,
  })
    .next()
    .toDate()
}

/** Claims and advances due schedules in one transaction, so concurrent pollers never double-fire one. */
export async function claimDueSchedules(
  db: DbClient,
  now: Date = new Date()
): Promise<Schedule[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schedules)
      .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)))
      .for("update", { skipLocked: true })

    const claimed: Schedule[] = []
    for (const schedule of due) {
      const nextRunAt = computeNextRunAt(
        schedule.cronExpression,
        schedule.timezone,
        now
      )
      const [updated] = await tx
        .update(schedules)
        .set({ nextRunAt, lastRunAt: now })
        .where(eq(schedules.id, schedule.id))
        .returning()
      claimed.push(updated)
    }
    return claimed
  })
}
