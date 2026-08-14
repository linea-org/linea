import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { db, pool, schema } from '@linea/db'
import { RequireRole } from './require-role.decorator'
import type { AuthenticatedRequest } from './workspace-auth.guard'
import { WorkspaceRoleGuard } from './workspace-role.guard'

afterAll(async () => {
  await pool.end()
})

class FakeController {
  @RequireRole('admin')
  adminOnlyAction() {}

  openAction() {}
}

const target = new FakeController()

// Only ever read for Reflector metadata lookup, never invoked with `this` — the unbound-method rule doesn't apply.
// eslint-disable-next-line @typescript-eslint/unbound-method
const openHandler = target.openAction
// eslint-disable-next-line @typescript-eslint/unbound-method
const adminOnlyHandler = target.adminOnlyAction

function contextFor(
  handler: () => void,
  request: Partial<AuthenticatedRequest>,
) {
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('WorkspaceRoleGuard', () => {
  const guard = new WorkspaceRoleGuard(new Reflector())

  it('allows any authenticated request through a route with no @RequireRole', async () => {
    const request = {
      workspaceId: 'org-1',
      session: { user: { id: 'user-1' } },
    } as Partial<AuthenticatedRequest>

    const allowed = await guard.canActivate(contextFor(openHandler, request))
    expect(allowed).toBe(true)
  })

  it('allows an API-key-authenticated request through a route with no @RequireRole', async () => {
    const request = {
      workspaceId: 'org-1',
      session: null,
    } as Partial<AuthenticatedRequest>

    const allowed = await guard.canActivate(contextFor(openHandler, request))
    expect(allowed).toBe(true)
  })

  it('rejects an API-key-authenticated request on an admin-only route — a key issued before that route was gated must not grandfather past the requirement', async () => {
    const request = {
      workspaceId: 'org-1',
      session: null,
    } as Partial<AuthenticatedRequest>

    await expect(
      guard.canActivate(contextFor(adminOnlyHandler, request)),
    ).rejects.toThrow(ForbiddenException)
  })

  it('rejects a plain member on an admin-only route, and allows an admin', async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Role Guard Test Org',
        slug: `role-guard-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [memberUser] = await db
      .insert(schema.users)
      .values({ name: 'Member User', email: `member-${suffix}@test.dev` })
      .returning()
    const [adminUser] = await db
      .insert(schema.users)
      .values({ name: 'Admin User', email: `admin-${suffix}@test.dev` })
      .returning()

    try {
      await db.insert(schema.members).values([
        {
          organizationId: organization.id,
          userId: memberUser.id,
          role: 'member',
          createdAt: new Date(),
        },
        {
          organizationId: organization.id,
          userId: adminUser.id,
          role: 'admin',
          createdAt: new Date(),
        },
      ])

      const memberRequest = {
        workspaceId: organization.id,
        session: { user: { id: memberUser.id } },
      } as Partial<AuthenticatedRequest>
      await expect(
        guard.canActivate(contextFor(adminOnlyHandler, memberRequest)),
      ).rejects.toThrow(ForbiddenException)

      const adminRequest = {
        workspaceId: organization.id,
        session: { user: { id: adminUser.id } },
      } as Partial<AuthenticatedRequest>
      const allowed = await guard.canActivate(
        contextFor(adminOnlyHandler, adminRequest),
      )
      expect(allowed).toBe(true)
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
        memberUser.id,
        adminUser.id,
      ])
    }
  })
})
