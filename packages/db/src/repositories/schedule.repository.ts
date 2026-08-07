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

/**
 * Claims due schedules and advances each one's nextRunAt in the same transaction, so two
 * worker instances polling concurrently never both fire the same schedule for one tick —
 * correctness holds even under plain `FOR UPDATE` since a blocked second transaction just
 * sees an already-advanced row. `SKIP LOCKED` is there so a busy poll cycle with many due
 * rows doesn't have one instance blocking behind another's held locks (and risking deadlock
 * from two transactions locking the same rows in different orders) instead of just moving
 * on to whatever's still free.
 */
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
