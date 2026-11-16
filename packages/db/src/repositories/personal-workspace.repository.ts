import { and, eq, sql } from "drizzle-orm"
import { members, organizations } from "../schema/index.js"
import type { DbClient } from "./types.js"

const SLUG_ATTEMPTS = 4

function slugBase(name: string): string {
  const slug = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-")
    .slice(0, 48)
  return slug || "workspace"
}

/**
 * Finds or creates the user's personal workspace. A per-user advisory lock makes concurrent calls
 * return the same workspace instead of creating one each.
 */
export function ensurePersonalWorkspace(
  db: DbClient,
  user: { id: string; name: string },
  personalMetadata: string
): Promise<{ id: string; slug: string }> {
  const firstName = user.name.trim().split(/\s+/)[0] ?? ""
  const lockKey = "personal-workspace:" + user.id
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`)
    const [existing] = await tx
      .select({ id: organizations.id, slug: organizations.slug })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(
        and(
          eq(members.userId, user.id),
          sql`${organizations.metadata} is not null and ${organizations.metadata}::jsonb @> ${personalMetadata}::jsonb`
        )
      )
    if (existing) return existing
    const base = slugBase(firstName)
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const slug =
        attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 4)}`
      const [created] = await tx
        .insert(organizations)
        .values({
          name: firstName ? `${firstName}'s workspace` : "My workspace",
          slug,
          metadata: personalMetadata,
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: organizations.slug })
        .returning({ id: organizations.id, slug: organizations.slug })
      if (!created) continue
      await tx.insert(members).values({
        organizationId: created.id,
        userId: user.id,
        role: "owner",
        createdAt: new Date(),
      })
      return created
    }
    throw new Error("Could not find a free address for the workspace")
  })
}
