import { randomUUID } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import { members, organizations, users } from "../schema/index.js"
import { ensurePersonalWorkspace } from "./personal-workspace.repository.js"

const metadata = JSON.stringify({ personal: true })
const createdUsers: string[] = []

afterAll(async () => {
  const owned = await db
    .select({ id: members.organizationId })
    .from(members)
    .where(inArray(members.userId, createdUsers))
  await db.delete(organizations).where(
    inArray(
      organizations.id,
      owned.map((row) => row.id)
    )
  )
  await db.delete(users).where(inArray(users.id, createdUsers))
  await pool.end()
})

async function createUser(name: string) {
  const [user] = await db
    .insert(users)
    .values({ name, email: `${randomUUID()}@test.dev`, emailVerified: true })
    .returning()
  createdUsers.push(user.id)
  return user
}

describe("ensurePersonalWorkspace", () => {
  it("creates one owned, flagged workspace named after the user", async () => {
    const user = await createUser(`Zed${randomUUID().slice(0, 6)} Tester`)
    const workspace = await ensurePersonalWorkspace(db, user, metadata)
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, workspace.id))
    expect(row.name).toBe(`${user.name.split(" ")[0]}'s workspace`)
    expect(row.metadata).toBe(metadata)
    const [membership] = await db
      .select()
      .from(members)
      .where(eq(members.organizationId, workspace.id))
    expect(membership).toMatchObject({ userId: user.id, role: "owner" })
  })

  it("returns the same workspace when called again or concurrently", async () => {
    const user = await createUser(`Conc${randomUUID().slice(0, 6)}`)
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        ensurePersonalWorkspace(db, user, metadata)
      )
    )
    expect(new Set(results.map((workspace) => workspace.id)).size).toBe(1)
    const owned = await db
      .select()
      .from(members)
      .where(eq(members.userId, user.id))
    expect(owned).toHaveLength(1)
  })

  it("takes the plain name when free and adds a suffix when it is taken", async () => {
    const first = `Same${randomUUID().slice(0, 6)}`.toLowerCase()
    const a = await ensurePersonalWorkspace(
      db,
      await createUser(first),
      metadata
    )
    const b = await ensurePersonalWorkspace(
      db,
      await createUser(first),
      metadata
    )
    expect(a.slug).toBe(first)
    expect(b.slug).toMatch(new RegExp(`^${first}-[0-9a-f]{4}$`))
  })

  it("falls back to a generic address for a name with no usable letters", async () => {
    const workspace = await ensurePersonalWorkspace(
      db,
      await createUser("日本語"),
      metadata
    )
    expect(workspace.slug).toMatch(/^workspace(-[0-9a-f]{4})?$/)
  })
})
