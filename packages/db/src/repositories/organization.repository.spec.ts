import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import { members, users } from "../schema/index.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import {
  findOrCreateOrganizationBySlug,
  getOrganizationBySlug,
  listMemberUserIdsByEmail,
} from "./organization.repository.js"

describe("findOrCreateOrganizationBySlug", () => {
  it("creates a new organization when none exists at that slug, and reuses it on a second call without overwriting it", async () => {
    const slug = `org-${randomUUID()}`
    try {
      const created = await findOrCreateOrganizationBySlug(db, {
        name: "Original Name",
        slug,
        createdAt: new Date(),
      })
      expect(created.slug).toBe(slug)

      const reused = await findOrCreateOrganizationBySlug(db, {
        name: "A Different Name",
        slug,
        createdAt: new Date(),
      })
      expect(reused.id).toBe(created.id)
      expect(reused.name).toBe("Original Name")
    } finally {
      await pool.query("DELETE FROM organizations WHERE slug = $1", [slug])
    }
  })

  it("resolves both concurrent callers to the same row instead of one crashing on the unique constraint", async () => {
    const slug = `org-race-${randomUUID()}`
    try {
      const [a, b] = await Promise.all([
        findOrCreateOrganizationBySlug(db, {
          name: "Racer A",
          slug,
          createdAt: new Date(),
        }),
        findOrCreateOrganizationBySlug(db, {
          name: "Racer B",
          slug,
          createdAt: new Date(),
        }),
      ])
      expect(a.id).toBe(b.id)

      const existing = await getOrganizationBySlug(db, slug)
      expect(existing?.id).toBe(a.id)
    } finally {
      await pool.query("DELETE FROM organizations WHERE slug = $1", [slug])
    }
  })
})

describe("listMemberUserIdsByEmail", () => {
  it("matches a member regardless of casing on either side", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const [member] = await tx
        .insert(users)
        .values({
          name: "Casing Test Member",
          email: `Casing-Test-${randomUUID()}@Test.dev`,
        })
        .returning()
      await tx.insert(members).values({
        organizationId: organization.id,
        userId: member.id,
        role: "member",
        createdAt: new Date(),
      })

      const userIds = await listMemberUserIdsByEmail(tx, organization.id, [
        member.email.toLowerCase(),
      ])
      expect(userIds).toEqual([member.id])
    })
  })
})
