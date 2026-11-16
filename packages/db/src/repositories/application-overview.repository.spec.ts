import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { executions, secrets, signals } from "../schema/index.js"
import { createApplication } from "./application.repository.js"
import { listApplicationOverviews } from "./application-overview.repository.js"
import { listEnvironments } from "./environment.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("Application overview", () => {
  it("reports environments, provider key, open signals and recent runs per application", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const quiet = await createApplication(tx, {
        workspaceId: organization.id,
        name: "Billing",
        slug: "billing",
      })
      const [dev] = await listEnvironments(
        tx,
        organization.id,
        workflow.applicationId
      )
      await tx.insert(secrets).values({
        environmentId: dev.id,
        key: "ANTHROPIC_API_KEY",
        encryptedValue: "x",
      })
      await tx.insert(signals).values([
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          flagType: "retry_storm",
          signalKey: randomUUID(),
        },
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          flagType: "retry_storm",
          signalKey: randomUUID(),
          resolvedAt: new Date(),
        },
      ])
      const run = {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual" as const,
      }
      await tx.insert(executions).values([
        { ...run, environmentId: dev.id, status: "failed" },
        { ...run, status: "succeeded" },
      ])

      const overviews = await listApplicationOverviews(tx, organization.id, [
        "ANTHROPIC_API_KEY",
      ])
      const busy = overviews.find(
        (item) => item.applicationId === workflow.applicationId
      )
      const idle = overviews.find((item) => item.applicationId === quiet.id)

      expect(busy?.hasProviderKey).toBe(true)
      expect(busy?.openSignals).toBe(1)
      expect(busy?.runsByDay.reduce((sum, day) => sum + day.count, 0)).toBe(2)
      expect(busy?.lastRun).not.toBeNull()
      expect(busy?.environments.every((item) => !item.live)).toBe(true)
      expect(idle?.environments.map((item) => item.environment)).toEqual([
        "dev",
        "production",
      ])
      expect(idle).toMatchObject({
        hasProviderKey: false,
        openSignals: 0,
        runsByDay: [],
        lastRun: null,
      })
    })
  })
})
