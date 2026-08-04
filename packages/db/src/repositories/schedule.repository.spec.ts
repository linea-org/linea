import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { schedules } from "../schema/index.js"
import { advanceSchedule, getDueSchedules } from "./schedule.repository.js"
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
