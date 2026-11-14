import { randomUUID } from 'node:crypto'
import { db, pool, schema } from '@linea/db'
import type { GeneratedApiKey } from '../auth/api-key.util'
import type { AuthenticatedRequest } from '../auth/workspace-auth.guard'

export type AuthorizationTestWorkspace = {
  workspaceId: string
  adminId: string
  memberId: string
}

/** Seeds a workspace with an admin, a member and a workspace API key for HTTP authorization specs. */
export async function seedAuthorizationWorkspace(
  name: string,
  key: GeneratedApiKey,
): Promise<AuthorizationTestWorkspace> {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name, slug: randomUUID(), createdAt: new Date() })
    .returning()
  const people = await db
    .insert(schema.users)
    .values(
      ['admin', 'member'].map((person) => ({
        name: person,
        email: `${randomUUID()}@test.dev`,
      })),
    )
    .returning()
  await db.insert(schema.members).values(
    people.map((user, i) => ({
      organizationId: workspace.id,
      userId: user.id,
      role: i === 0 ? 'admin' : 'member',
      createdAt: new Date(),
    })),
  )
  await db.insert(schema.apiKeys).values({
    workspaceId: workspace.id,
    name: 'Test',
    hashedKey: key.hashedKey,
    keyPrefix: key.keyPrefix,
  })
  return {
    workspaceId: workspace.id,
    adminId: people[0].id,
    memberId: people[1].id,
  }
}

/** Stands in for the session middleware: the `x-test-user` header signs that user into the workspace. */
export function testUserSession(workspaceId: string) {
  return (req: AuthenticatedRequest, _res: unknown, next: () => void) => {
    const userId = req.headers['x-test-user']
    if (typeof userId === 'string')
      req.session = {
        user: { id: userId },
        session: { activeOrganizationId: workspaceId },
      }
    next()
  }
}

export async function deleteAuthorizationWorkspace(
  seeded: AuthorizationTestWorkspace,
): Promise<void> {
  await pool.query('DELETE FROM organizations WHERE id = $1', [
    seeded.workspaceId,
  ])
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
    seeded.adminId,
    seeded.memberId,
  ])
}
