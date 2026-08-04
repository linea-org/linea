import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  createWorkflowVersion,
  getPublishedVersion,
  getWorkflowBySlug,
  publishWorkflowVersion,
} from "./workflow.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("createWorkflowVersion", () => {
  it("auto-increments the version number per workflow", async () => {
    await withRollback(async (tx) => {
      const { workflow } = await createTestFixtures(tx)

      const v2 = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        graph: {},
        contentHash: "hash-2",
      })
      const v3 = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        graph: {},
        contentHash: "hash-3",
      })

      // createTestFixtures already created version 1.
      expect(v2.version).toBe(2)
      expect(v3.version).toBe(3)
    })
  })

  it("starts a different workflow's versions at 1", async () => {
    await withRollback(async (tx) => {
      const { workflow: workflowA } = await createTestFixtures(tx)
      const { workflow: workflowB } = await createTestFixtures(tx)

      const versionA = await createWorkflowVersion(tx, {
        workflowId: workflowA.id,
        graph: {},
        contentHash: "hash-a",
      })
      const versionB = await createWorkflowVersion(tx, {
        workflowId: workflowB.id,
        graph: {},
        contentHash: "hash-b",
      })

      expect(versionA.version).toBe(2)
      expect(versionB.version).toBe(2)
    })
  })
})

describe("publishWorkflowVersion", () => {
  it("sets the workflow's publishedVersionId and stamps publishedAt", async () => {
    await withRollback(async (tx) => {
      const { workflow, version } = await createTestFixtures(tx)

      const published = await publishWorkflowVersion(
        tx,
        workflow.id,
        version.id
      )
      expect(published.publishedVersionId).toBe(version.id)

      const resolved = await getPublishedVersion(tx, workflow.id)
      expect(resolved?.id).toBe(version.id)
      expect(resolved?.publishedAt).toBeInstanceOf(Date)
    })
  })

  it("rejects publishing a version that belongs to a different workflow", async () => {
    await withRollback(async (tx) => {
      const { workflow: workflowA } = await createTestFixtures(tx)
      const { version: versionB } = await createTestFixtures(tx)

      await expect(
        publishWorkflowVersion(tx, workflowA.id, versionB.id)
      ).rejects.toThrow()
    })
  })
})

describe("getWorkflowBySlug", () => {
  it("scopes by workspace, not just slug", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)

      const found = await getWorkflowBySlug(tx, organization.id, workflow.slug)
      expect(found?.id).toBe(workflow.id)

      const notFound = await getWorkflowBySlug(tx, otherOrg.id, workflow.slug)
      expect(notFound).toBeUndefined()
    })
  })

  it("returns undefined for a slug that doesn't exist", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const found = await getWorkflowBySlug(tx, organization.id, randomUUID())
      expect(found).toBeUndefined()
    })
  })
})
