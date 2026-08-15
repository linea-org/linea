import { and, eq, inArray } from "drizzle-orm"
import {
  members,
  organizations,
  users,
  type NewOrganization,
  type Organization,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getOrganizationBySlug(
  db: DbClient,
  slug: string
): Promise<Organization | undefined> {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
  return organization
}

/** Atomic: concurrent callers racing to create the same slug never crash on the unique constraint — the loser's insert no-ops and it re-reads whatever the winner inserted. */
export async function findOrCreateOrganizationBySlug(
  db: DbClient,
  input: NewOrganization
): Promise<Organization> {
  const [inserted] = await db
    .insert(organizations)
    .values(input)
    .onConflictDoNothing({ target: organizations.slug })
    .returning()
  if (inserted) return inserted

  const existing = await getOrganizationBySlug(db, input.slug)
  if (!existing) {
    throw new Error(`Failed to find or create organization "${input.slug}"`)
  }
  return existing
}

/** better-auth's organization plugin owns the members table — this is a read-only lookup for workspace-wide notification fan-out, not a mutation path. */
export async function listMemberUserIds(
  db: DbClient,
  organizationId: string
): Promise<string[]> {
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.organizationId, organizationId))
  return rows.map((r) => r.userId)
}

/** Resolves a set of emails to the user ids among them that are actually members of this workspace — silently skips emails with no matching member (e.g. a typo, or someone outside the workspace), rather than failing the whole lookup. */
export async function listMemberUserIdsByEmail(
  db: DbClient,
  organizationId: string,
  emails: string[]
): Promise<string[]> {
  if (emails.length === 0) return []
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(members.organizationId, organizationId),
        inArray(users.email, emails)
      )
    )
  return rows.map((r) => r.userId)
}

/** better-auth's organization plugin owns the members table — this is a read-only lookup for the API's own role checks, not a mutation path. */
export async function getMemberRole(
  db: DbClient,
  organizationId: string,
  userId: string
): Promise<string | undefined> {
  const [member] = await db
    .select({ role: members.role })
    .from(members)
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.userId, userId)
      )
    )
  return member?.role
}
