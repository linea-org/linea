import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { db, pool, repositories, schema } from '@linea/db'
import type { WorkspaceKeyScope } from '@linea/protocol/resources'
import { generateApiKey } from './api-key.util'
import { RequireWorkspaceKeyScopes } from './require-workspace-key-scopes.decorator'
import {
  WorkspaceAuthGuard,
  type AuthenticatedRequest,
} from './workspace-auth.guard'

afterAll(async () => {
  await pool.end()
})

class FakeController {
  @RequireWorkspaceKeyScopes('executions:read')
  readExecutions() {}

  @RequireWorkspaceKeyScopes('executions:read', 'executions:start')
  startExecutions() {}

  sessionOnly() {}
}

type Handler = keyof FakeController

function contextWithRequest(
  request: Partial<AuthenticatedRequest>,
  handler: Handler = 'readExecutions',
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => FakeController.prototype[handler],
    getClass: () => FakeController,
  } as unknown as ExecutionContext
}

async function createOrgWithMember(suffix: string, role: string) {
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'Workspace Guard Test Org',
      slug: `workspace-guard-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Workspace Guard Test User',
      email: `workspace-guard-${suffix}@example.com`,
      emailVerified: true,
    })
    .returning()
  await db.insert(schema.members).values({
    organizationId: organization.id,
    userId: user.id,
    role,
    createdAt: new Date(),
  })
  return { organization, user }
}

async function removeOrgWithMember(organizationId: string, userId: string) {
  await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId])
  await pool.query('DELETE FROM users WHERE id = $1', [userId])
}

async function mintKey(
  workspaceId: string,
  createdByUserId: string,
  scopes: WorkspaceKeyScope[],
  expiresAt = new Date(Date.now() + 86_400_000),
) {
  const { rawKey, hashedKey, keyPrefix } = generateApiKey()
  const apiKey = await repositories.apiKey.createApiKey(db, {
    workspaceId,
    createdByUserId,
    name: 'CI key',
    scopes,
    expiresAt,
    hashedKey,
    keyPrefix,
  })
  return { apiKey, rawKey }
}

function keyRequest(rawKey: string): Partial<AuthenticatedRequest> {
  return { headers: { authorization: `Bearer ${rawKey}` }, session: null }
}

describe('WorkspaceAuthGuard', () => {
  const guard = new WorkspaceAuthGuard(new Reflector())

  it('resolves the workspace from an active session, for a user who is still a live member, even on a session-only route', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'member',
    )
    try {
      const request = {
        headers: {},
        session: {
          session: { activeOrganizationId: organization.id },
          user: { id: user.id },
        },
      } as Partial<AuthenticatedRequest>
      const allowed = await guard.canActivate(
        contextWithRequest(request, 'sessionOnly'),
      )
      expect(allowed).toBe(true)
      expect(request.workspaceId).toBe(organization.id)
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('rejects a session whose activeOrganizationId the user is no longer a member of, even with no API key fallback', async () => {
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workspace Guard Stale Session Org',
        slug: `workspace-guard-stale-${randomUUID()}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const request = {
        headers: {},
        session: {
          session: { activeOrganizationId: organization.id },
          user: { id: randomUUID() },
        },
      } as Partial<AuthenticatedRequest>
      await expect(
        guard.canActivate(contextWithRequest(request)),
      ).rejects.toThrow(UnauthorizedException)
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('clears a stale session before falling back to a valid API key, so the session user is never attributed downstream', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'admin',
    )
    try {
      const { rawKey } = await mintKey(organization.id, user.id, [
        'executions:read',
      ])
      const request = {
        headers: { authorization: `Bearer ${rawKey}` },
        session: {
          session: { activeOrganizationId: organization.id },
          user: { id: randomUUID() },
        },
      } as Partial<AuthenticatedRequest>
      const allowed = await guard.canActivate(contextWithRequest(request))
      expect(allowed).toBe(true)
      expect(request.workspaceId).toBe(organization.id)
      expect(request.session).toBeNull()
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('resolves the workspace from an API key holding every scope the route requires', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'owner',
    )
    try {
      const { apiKey, rawKey } = await mintKey(organization.id, user.id, [
        'executions:read',
        'executions:start',
      ])
      const request = keyRequest(rawKey)
      const allowed = await guard.canActivate(
        contextWithRequest(request, 'startExecutions'),
      )
      expect(allowed).toBe(true)
      expect(request.workspaceId).toBe(organization.id)
      const stored = await repositories.apiKey.getApiKeyByHash(
        db,
        apiKey.hashedKey,
      )
      expect(stored?.lastUsedAt).toBeInstanceOf(Date)
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('refuses an API key missing one of the route scopes, without recording use', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'admin',
    )
    try {
      const { apiKey, rawKey } = await mintKey(organization.id, user.id, [
        'executions:read',
      ])
      await expect(
        guard.canActivate(
          contextWithRequest(keyRequest(rawKey), 'startExecutions'),
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'API key is missing required scope: executions:start',
        ),
      )
      const stored = await repositories.apiKey.getApiKeyByHash(
        db,
        apiKey.hashedKey,
      )
      expect(stored?.lastUsedAt).toBeNull()
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('refuses every API key, whatever its scopes, on a route that declares no key scopes', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'admin',
    )
    try {
      const { rawKey } = await mintKey(organization.id, user.id, [
        'workflows:read',
        'executions:read',
        'executions:start',
      ])
      await expect(
        guard.canActivate(
          contextWithRequest(keyRequest(rawKey), 'sessionOnly'),
        ),
      ).rejects.toThrow(ForbiddenException)
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('rejects an expired API key', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'admin',
    )
    try {
      const { rawKey } = await mintKey(
        organization.id,
        user.id,
        ['executions:read'],
        new Date(Date.now() - 1000),
      )
      await expect(
        guard.canActivate(contextWithRequest(keyRequest(rawKey))),
      ).rejects.toThrow(new UnauthorizedException('API key has expired'))
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('rejects an API key whose creator was demoted below admin or left the workspace', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'admin',
    )
    try {
      const { rawKey } = await mintKey(organization.id, user.id, [
        'executions:read',
      ])
      await expect(
        guard.canActivate(contextWithRequest(keyRequest(rawKey))),
      ).resolves.toBe(true)
      await pool.query(
        "UPDATE members SET role = 'member' WHERE organization_id = $1",
        [organization.id],
      )
      await expect(
        guard.canActivate(contextWithRequest(keyRequest(rawKey))),
      ).rejects.toThrow(UnauthorizedException)
      await pool.query('DELETE FROM members WHERE organization_id = $1', [
        organization.id,
      ])
      await expect(
        guard.canActivate(contextWithRequest(keyRequest(rawKey))),
      ).rejects.toThrow(UnauthorizedException)
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('accepts a pre-scope key with no recorded creator only within its scopes', async () => {
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workspace Guard Legacy Key Org',
        slug: `workspace-guard-legacy-${randomUUID()}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const { rawKey, hashedKey, keyPrefix } = generateApiKey()
      await db.insert(schema.apiKeys).values({
        workspaceId: organization.id,
        name: 'Legacy key',
        scopes: ['executions:read'],
        expiresAt: new Date(Date.now() + 86_400_000),
        hashedKey,
        keyPrefix,
      })
      await expect(
        guard.canActivate(contextWithRequest(keyRequest(rawKey))),
      ).resolves.toBe(true)
      await expect(
        guard.canActivate(
          contextWithRequest(keyRequest(rawKey), 'startExecutions'),
        ),
      ).rejects.toThrow(ForbiddenException)
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('rejects a revoked API key', async () => {
    const { organization, user } = await createOrgWithMember(
      randomUUID(),
      'admin',
    )
    try {
      const { apiKey, rawKey } = await mintKey(organization.id, user.id, [
        'executions:read',
      ])
      await repositories.apiKey.revokeApiKey(
        db,
        organization.id,
        apiKey.id,
        user.id,
      )
      await expect(
        guard.canActivate(contextWithRequest(keyRequest(rawKey))),
      ).rejects.toThrow(UnauthorizedException)
    } finally {
      await removeOrgWithMember(organization.id, user.id)
    }
  })

  it('rejects with neither a session nor an Authorization header', async () => {
    const request = {
      headers: {},
      session: null,
    } as Partial<AuthenticatedRequest>
    await expect(
      guard.canActivate(contextWithRequest(request)),
    ).rejects.toThrow(UnauthorizedException)
  })
})
