import { and, eq, lte } from "drizzle-orm"
import { CronExpressionParser } from "cron-parser"
import { schedules, type Execution, type Schedule } from "../schema/index.js"
import {
  triggerWorkflowExecution,
  type TriggerWorkflowResult,
} from "./execution.repository.js"
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

export type FireDueScheduleResult =
  | { outcome: "empty" }
  | { outcome: "fired"; schedule: Schedule; execution: Execution }
  | {
      outcome: "skipped"
      schedule: Schedule
      reason: Exclude<TriggerWorkflowResult["outcome"], "created">
    }

/** Claims one due schedule and fires it in a single transaction, so a crash or trigger failure can't advance next_run_at without an execution ever being created. */
export async function claimAndFireDueSchedule(
  db: DbClient,
  now: Date = new Date()
): Promise<FireDueScheduleResult> {
  return db.transaction(async (tx) => {
    const [schedule] = await tx
      .select()
      .from(schedules)
      .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)))
      .for("update", { skipLocked: true })
      .limit(1)

    if (!schedule) return { outcome: "empty" }

    const nextRunAt = computeNextRunAt(
      schedule.cronExpression,
      schedule.timezone,
      now
    )
    const [advanced] = await tx
      .update(schedules)
      .set({ nextRunAt, lastRunAt: now })
      .where(eq(schedules.id, schedule.id))
      .returning()

    const result = await triggerWorkflowExecution(
      tx,
      schedule.workspaceId,
      { by: "id", value: schedule.workflowId },
      { trigger: "schedule" }
    )

    if (result.outcome !== "created") {
      return { outcome: "skipped", schedule: advanced, reason: result.outcome }
    }
    return { outcome: "fired", schedule: advanced, execution: result.execution }
  })
}
