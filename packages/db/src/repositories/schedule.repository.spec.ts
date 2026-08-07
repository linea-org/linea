import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import { schedules } from "../schema/index.js"
import {
  advanceSchedule,
  claimAndFireDueSchedule,
  getDueSchedules,
} from "./schedule.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import { publishWorkflowVersion } from "./workflow.repository.js"

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

describe("claimAndFireDueSchedule", () => {
  it("fires a due, published schedule and advances it, leaving not-yet-due and disabled ones untouched", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
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
      const [notYetDue] = await tx
        .insert(schedules)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          cronExpression: "* * * * *",
          nextRunAt: new Date(now.getTime() + 60_000),
        })
        .returning()
      const [disabled] = await tx
        .insert(schedules)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          cronExpression: "* * * * *",
          enabled: false,
          nextRunAt: new Date(now.getTime() - 1_000),
        })
        .returning()

      const result = await claimAndFireDueSchedule(tx, now)
      expect(result.outcome).toBe("fired")
      if (result.outcome !== "fired") return
      expect(result.schedule.id).toBe(due.id)
      expect(result.schedule.nextRunAt.getTime()).toBeGreaterThan(now.getTime())
      expect(result.execution.trigger).toBe("schedule")
      expect(result.execution.workspaceId).toBe(organization.id)

      const [untouchedNotYetDue] = await tx
        .select()
        .from(schedules)
        .where(eq(schedules.id, notYetDue.id))
      const [untouchedDisabled] = await tx
        .select()
        .from(schedules)
        .where(eq(schedules.id, disabled.id))
      expect(untouchedNotYetDue.nextRunAt.getTime()).toBe(
        notYetDue.nextRunAt.getTime()
      )
      expect(untouchedDisabled.nextRunAt.getTime()).toBe(
        disabled.nextRunAt.getTime()
      )
    })
  })

  it("computes the next run from the cron expression and timezone", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
      const now = new Date("2026-01-01T00:00:30.000Z")

      await tx.insert(schedules).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        cronExpression: "* * * * *",
        timezone: "UTC",
        nextRunAt: new Date(now.getTime() - 1_000),
      })

      const result = await claimAndFireDueSchedule(tx, now)
      expect(result.outcome).toBe("fired")
      if (result.outcome !== "fired") return
      expect(result.schedule.nextRunAt.toISOString()).toBe(
        "2026-01-01T00:01:00.000Z"
      )
    })
  })

  it("still advances a due schedule pointing at an unpublished workflow, but skips firing it", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const now = new Date()

      await tx.insert(schedules).values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        cronExpression: "* * * * *",
        nextRunAt: new Date(now.getTime() - 1_000),
      })

      const result = await claimAndFireDueSchedule(tx, now)
      expect(result.outcome).toBe("skipped")
      if (result.outcome !== "skipped") return
      expect(result.reason).toBe("unpublished")
      expect(result.schedule.nextRunAt.getTime()).toBeGreaterThan(now.getTime())
    })
  })

  it("returns empty when nothing is due", async () => {
    await withRollback(async (tx) => {
      const result = await claimAndFireDueSchedule(tx, new Date())
      expect(result.outcome).toBe("empty")
    })
  })

  it("fires a due schedule exactly once under concurrent callers, advancing next_run_at and creating exactly one execution", async () => {
    const { organization, workflow, version } = await db.transaction((tx) =>
      createTestFixtures(tx)
    )
    await publishWorkflowVersion(db, workflow.id, version.id)
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
        claimAndFireDueSchedule(db, now),
        claimAndFireDueSchedule(db, now),
      ])

      const fired = [resultA, resultB].filter((r) => r.outcome === "fired")
      expect(fired).toHaveLength(1)
      expect(fired[0].schedule.id).toBe(schedule.id)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
