import { randomUUID } from "node:crypto"
import { db, pool, schema } from "@linealabs/db"
import { seedExecution } from "@linealabs/db/testing"

export async function createFlaggerWorkspace(name: string) {
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name, slug: `flaggers-${randomUUID()}`, createdAt: new Date() })
    .returning()
  const { execution } = await seedExecution(db, organization.id, {
    nodes: [],
    edges: [],
  })
  return { organization, execution }
}

export async function deleteFlaggerWorkspace(id: string) {
  await pool.query("DELETE FROM organizations WHERE id = $1", [id])
}
