import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { endSubjects } from "../schema/index.js"
import { upsertEndSubject } from "./end-subject.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("upsertEndSubject", () => {
  it("creates a new row on first sight, and reuses it on a later sighting instead of duplicating", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)

      const first = await upsertEndSubject(tx, {
        workspaceId: organization.id,
        externalId: "customer-user-1",
      })
      const second = await upsertEndSubject(tx, {
        workspaceId: organization.id,
        externalId: "customer-user-1",
      })

      expect(second.id).toBe(first.id)
      expect(second.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
        first.lastSeenAt.getTime()
      )

      const rows = await tx
        .select()
        .from(endSubjects)
        .where(
          and(
            eq(endSubjects.workspaceId, organization.id),
            eq(endSubjects.externalId, "customer-user-1")
          )
        )
      expect(rows).toHaveLength(1)
    })
  })

  it("scopes rows per workspace, so the same externalId in two workspaces creates two rows", async () => {
    await withRollback(async (tx) => {
      const { organization: orgA } = await createTestFixtures(tx)
      const { organization: orgB } = await createTestFixtures(tx)

      const a = await upsertEndSubject(tx, {
        workspaceId: orgA.id,
        externalId: "shared-external-id",
      })
      const b = await upsertEndSubject(tx, {
        workspaceId: orgB.id,
        externalId: "shared-external-id",
      })

      expect(a.id).not.toBe(b.id)
    })
  })

  it("does not resurrect an erased subject's deletedAt marker on a later sighting", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)

      const created = await upsertEndSubject(tx, {
        workspaceId: organization.id,
        externalId: "customer-user-1",
      })
      await tx
        .update(endSubjects)
        .set({ deletedAt: new Date() })
        .where(eq(endSubjects.id, created.id))

      const resighted = await upsertEndSubject(tx, {
        workspaceId: organization.id,
        externalId: "customer-user-1",
      })

      expect(resighted.deletedAt).not.toBeNull()
    })
  })
})
