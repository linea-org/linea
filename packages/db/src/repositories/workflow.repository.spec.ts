import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import { organizations, workflows, workflowVersions } from "../schema/index.js"
import {
  createWorkflow,
  createWorkflowVersion,
  findOrCreateWorkflowBySlug,
  getPublishedVersion,
  getWorkflowById,
  getWorkflowBySlug,
  getWorkflowVersionById,
  listWorkflows,
  publishWorkflowVersion,
  updateWorkflow,
} from "./workflow.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

  it("blocks a second lock attempt on the same workflow until the first ends", async () => {
    // Promise.all on two createWorkflowVersion calls doesn't reliably race —
    // network/scheduling timing can make them not overlap even with the bug
    // present. This drives two raw connections directly to prove the actual
    // mechanism (FOR UPDATE) blocks, deterministically.
    const { workflow } = await db.transaction((tx) => createTestFixtures(tx))
    const clientA = await pool.connect()
    const clientB = await pool.connect()

    try {
      await clientA.query("BEGIN")
      await clientA.query("SELECT id FROM workflows WHERE id = $1 FOR UPDATE", [
        workflow.id,
      ])

      await clientB.query("BEGIN")
      let bAcquired = false
      const bLockAttempt = clientB
        .query("SELECT id FROM workflows WHERE id = $1 FOR UPDATE", [
          workflow.id,
        ])
        .then(() => {
          bAcquired = true
        })

      await wait(200)
      expect(bAcquired).toBe(false)

      await clientA.query("COMMIT")
      await bLockAttempt
      expect(bAcquired).toBe(true)

      await clientB.query("COMMIT")
    } finally {
      await clientA.query("ROLLBACK").catch(() => {})
      await clientB.query("ROLLBACK").catch(() => {})
      clientA.release()
      clientB.release()
      await db
        .delete(workflowVersions)
        .where(eq(workflowVersions.workflowId, workflow.id))
      await db.delete(workflows).where(eq(workflows.id, workflow.id))
      await db
        .delete(organizations)
        .where(eq(organizations.id, workflow.workspaceId))
    }
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

describe("findOrCreateWorkflowBySlug", () => {
  it("creates a new workflow when none exists at that slug, and reuses it on a second call without overwriting it", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const slug = `workflow-${randomUUID()}`

      const created = await findOrCreateWorkflowBySlug(tx, {
        workspaceId: organization.id,
        name: "Original Name",
        slug,
      })
      expect(created.slug).toBe(slug)

      const reused = await findOrCreateWorkflowBySlug(tx, {
        workspaceId: organization.id,
        name: "A Different Name",
        slug,
      })
      expect(reused.id).toBe(created.id)
      expect(reused.name).toBe("Original Name")
    })
  })

  it("resolves both concurrent callers to the same row instead of one crashing on the unique constraint", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(organizations)
      .values({
        name: "Concurrent Workflow Test Org",
        slug: `concurrent-workflow-org-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const slug = `workflow-race-${suffix}`

    try {
      const [a, b] = await Promise.all([
        findOrCreateWorkflowBySlug(db, {
          workspaceId: organization.id,
          name: "Racer A",
          slug,
        }),
        findOrCreateWorkflowBySlug(db, {
          workspaceId: organization.id,
          name: "Racer B",
          slug,
        }),
      ])
      expect(a.id).toBe(b.id)

      const existing = await getWorkflowBySlug(db, organization.id, slug)
      expect(existing?.id).toBe(a.id)
    } finally {
      await db
        .delete(workflows)
        .where(eq(workflows.workspaceId, organization.id))
      await db
        .delete(organizations)
        .where(eq(organizations.id, organization.id))
    }
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

describe("getWorkflowVersionById", () => {
  it("returns the exact version bound at the given id, not the currently published one", async () => {
    await withRollback(async (tx) => {
      const { workflow, version } = await createTestFixtures(tx)
      const newer = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        graph: {},
        contentHash: "newer-hash",
      })
      await publishWorkflowVersion(tx, workflow.id, newer.id)

      const found = await getWorkflowVersionById(tx, version.id)
      expect(found?.id).toBe(version.id)
      expect(found?.id).not.toBe(newer.id)
    })
  })

  it("returns undefined for an id that doesn't exist", async () => {
    await withRollback(async (tx) => {
      const found = await getWorkflowVersionById(tx, randomUUID())
      expect(found).toBeUndefined()
    })
  })
})

describe("getWorkflowById", () => {
  it("scopes by workspace, not just id", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)

      const found = await getWorkflowById(tx, organization.id, workflow.id)
      expect(found?.id).toBe(workflow.id)

      const notFound = await getWorkflowById(tx, otherOrg.id, workflow.id)
      expect(notFound).toBeUndefined()
    })
  })
})

describe("listWorkflows", () => {
  it("excludes archived workflows by default, includes them when asked", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const suffix = randomUUID()
      const active = await createWorkflow(tx, {
        workspaceId: organization.id,
        name: "Active",
        slug: `active-${suffix}`,
      })
      const archived = await createWorkflow(tx, {
        workspaceId: organization.id,
        name: "Archived",
        slug: `archived-${suffix}`,
        archivedAt: new Date(),
      })

      const defaultList = await listWorkflows(tx, organization.id)
      const defaultIds = defaultList.map((w) => w.id)
      expect(defaultIds).toContain(active.id)
      expect(defaultIds).not.toContain(archived.id)

      const fullList = await listWorkflows(tx, organization.id, {
        includeArchived: true,
      })
      const fullIds = fullList.map((w) => w.id)
      expect(fullIds).toContain(active.id)
      expect(fullIds).toContain(archived.id)
    })
  })

  it("does not return another workspace's workflows", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg, workflow: otherWorkflow } =
        await createTestFixtures(tx)

      const list = await listWorkflows(tx, organization.id)
      expect(list.map((w) => w.id)).not.toContain(otherWorkflow.id)
      expect(otherOrg.id).not.toBe(organization.id)
    })
  })
})

describe("updateWorkflow", () => {
  it("updates fields scoped to the owning workspace", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)

      const updated = await updateWorkflow(tx, organization.id, workflow.id, {
        name: "Renamed",
      })
      expect(updated?.name).toBe("Renamed")
    })
  })

  it("does not update a workflow belonging to a different workspace", async () => {
    await withRollback(async (tx) => {
      const { workflow } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)

      const updated = await updateWorkflow(tx, otherOrg.id, workflow.id, {
        name: "Hijacked",
      })
      expect(updated).toBeUndefined()

      const stillOriginal = await getWorkflowById(
        tx,
        workflow.workspaceId,
        workflow.id
      )
      expect(stillOriginal?.name).toBe(workflow.name)
    })
  })

  it("archives a workflow by setting archivedAt", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)

      const archived = await updateWorkflow(tx, organization.id, workflow.id, {
        archivedAt: new Date(),
      })
      expect(archived?.archivedAt).toBeInstanceOf(Date)

      const list = await listWorkflows(tx, organization.id)
      expect(list.map((w) => w.id)).not.toContain(workflow.id)
    })
  })
})
