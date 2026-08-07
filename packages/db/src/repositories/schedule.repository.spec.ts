import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import { schedules } from "../schema/index.js"
import {
  advanceSchedule,
  claimDueSchedules,
  getDueSchedules,
} from "./schedule.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("getDueSchedules", () => {
  it("returns only enabled schedules due by the given time", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const now = new Date()

      const [due] = await tx
        .insert(schedules)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          cronExpression: "* * * * *",
          nextRunAt: new Date(now.getTime() - 1_000),
        })
        .returning()
      await tx.insert(schedules).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        cronExpression: "* * * * *",
        nextRunAt: new Date(now.getTime() + 60_000),
      })
      await tx.insert(schedules).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        cronExpression: "* * * * *",
        enabled: false,
        nextRunAt: new Date(now.getTime() - 1_000),
      })

      const results = await getDueSchedules(tx, now)
      expect(results.map((s) => s.id)).toEqual([due.id])
    })
  })
})

describe("advanceSchedule", () => {
  it("updates nextRunAt and stamps lastRunAt", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const [schedule] = await tx
        .insert(schedules)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          cronExpression: "* * * * *",
          nextRunAt: new Date(),
        })
        .returning()

      const nextRunAt = new Date(Date.now() + 3_600_000)
      await advanceSchedule(tx, schedule.id, nextRunAt)

      const [updated] = await tx
        .select()
        .from(schedules)
        .where(eq(schedules.id, schedule.id))
      expect(updated.nextRunAt.getTime()).toBe(nextRunAt.getTime())
      expect(updated.lastRunAt).toBeInstanceOf(Date)
    })
  })
})

describe("claimDueSchedules", () => {
  it("claims and advances a due, enabled schedule, leaving not-yet-due and disabled ones untouched", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const now = new Date()

      const [due] = await tx
        .insert(schedules)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          cronExpression: "* * * * *",
          nextRunAt: new Date(now.getTime() - 1_000),
        })
        .returning()
      await tx.insert(schedules).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        cronExpression: "* * * * *",
        nextRunAt: new Date(now.getTime() + 60_000),
      })
      await tx.insert(schedules).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        cronExpression: "* * * * *",
        enabled: false,
        nextRunAt: new Date(now.getTime() - 1_000),
      })

      const claimed = await claimDueSchedules(tx, now)
      expect(claimed.map((s) => s.id)).toEqual([due.id])
      expect(claimed[0].nextRunAt.getTime()).toBeGreaterThan(now.getTime())
      expect(claimed[0].lastRunAt?.getTime()).toBe(now.getTime())
    })
  })

  it("computes the next run from the cron expression and timezone", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const now = new Date("2026-01-01T00:00:30.000Z")

      await tx.insert(schedules).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        cronExpression: "* * * * *",
        timezone: "UTC",
        nextRunAt: new Date(now.getTime() - 1_000),
      })

      const [claimed] = await claimDueSchedules(tx, now)
      expect(claimed.nextRunAt.toISOString()).toBe("2026-01-01T00:01:00.000Z")
    })
  })

  it("never claims the same due schedule twice under concurrent callers", async () => {
    const { organization, workflow } = await db.transaction((tx) =>
      createTestFixtures(tx)
    )
    const now = new Date()

    try {
      const [schedule] = await db
        .insert(schedules)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          cronExpression: "* * * * *",
          nextRunAt: new Date(now.getTime() - 1_000),
        })
        .returning()

      const [resultA, resultB] = await Promise.all([
        claimDueSchedules(db, now),
        claimDueSchedules(db, now),
      ])

      const claimedIds = [...resultA, ...resultB].map((s) => s.id)
      expect(claimedIds).toEqual([schedule.id])
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
