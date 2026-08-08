import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  findOrCreateOrganizationBySlug,
  getOrganizationBySlug,
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
