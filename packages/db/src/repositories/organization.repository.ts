import { eq } from "drizzle-orm"
import {
  organizations,
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

export async function createOrganization(
  db: DbClient,
  input: NewOrganization
): Promise<Organization> {
  const [organization] = await db
    .insert(organizations)
    .values(input)
    .returning()
  return organization
}
