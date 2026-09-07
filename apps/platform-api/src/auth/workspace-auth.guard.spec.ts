import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import { db, pool, repositories, schema } from '@linea/db'
import { generateApiKey } from './api-key.util'
import {
  WorkspaceAuthGuard,
  type AuthenticatedRequest,
} from './workspace-auth.guard'

afterAll(async () => {
  await pool.end()
})

function contextWithRequest(request: Partial<AuthenticatedRequest>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext
}

async function createOrgWithMember(suffix: string) {
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
    role: 'member',
    createdAt: new Date(),
  })
  return { organization, user }
}

describe('WorkspaceAuthGuard', () => {
  const guard = new WorkspaceAuthGuard()

  it('resolves the workspace from an active session, for a user who is still a live member', async () => {
    const suffix = randomUUID()
    const { organization, user } = await createOrgWithMember(suffix)

    try {
      const request = {
        headers: {},
        session: {
          session: { activeOrganizationId: organization.id },
          user: { id: user.id },
        },
      } as Partial<AuthenticatedRequest>

      const allowed = await guard.canActivate(contextWithRequest(request))
      expect(allowed).toBe(true)
      expect(request.workspaceId).toBe(organization.id)
      expect(request.apiKeyPurpose).toBeUndefined()
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    }
  })

  it('rejects a session whose activeOrganizationId the user is no longer a member of, even with no API key fallback', async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workspace Guard Stale Session Org',
        slug: `workspace-guard-stale-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const request = {
        headers: {},
        // A session whose activeOrganizationId points at a real org, but the session's own user
        // was never (or is no longer) a member of it — e.g. removed after the session was issued.
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
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workspace Guard Mixed Credential Test Org',
        slug: `workspace-guard-mixed-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const { rawKey, hashedKey, keyPrefix } = generateApiKey()
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'CI key',
        hashedKey,
        keyPrefix,
      })

      const request = {
        headers: { authorization: `Bearer ${rawKey}` },
        // A stale session for a user who is not a member of this org — must not survive past
        // the API key actually authorizing this request, or OptionalUserId downstream would
        // still attribute the action to this session's user.
        session: {
          session: { activeOrganizationId: organization.id },
          user: { id: randomUUID() },
        },
      } as Partial<AuthenticatedRequest>

      const allowed = await guard.canActivate(contextWithRequest(request))
      expect(allowed).toBe(true)
      expect(request.workspaceId).toBe(organization.id)
      expect(request.apiKeyPurpose).toBe('platform')
      expect(request.session).toBeNull()
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('resolves the workspace from a valid API key when there is no session', async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workspace Guard Test Org',
        slug: `workspace-guard-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const { rawKey, hashedKey, keyPrefix } = generateApiKey()
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'CI key',
        hashedKey,
        keyPrefix,
      })

      const request = {
        headers: { authorization: `Bearer ${rawKey}` },
        session: null,
      } as Partial<AuthenticatedRequest>

      const allowed = await guard.canActivate(contextWithRequest(request))
      expect(allowed).toBe(true)
      expect(request.workspaceId).toBe(organization.id)
      expect(request.apiKeyPurpose).toBe('platform')
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('rejects a revoked API key', async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workspace Guard Revoked Test Org',
        slug: `workspace-guard-revoked-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const { rawKey, hashedKey, keyPrefix } = generateApiKey()
      const apiKey = await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'CI key',
        hashedKey,
        keyPrefix,
      })
      await repositories.apiKey.revokeApiKey(db, organization.id, apiKey.id)

      const request = {
        headers: { authorization: `Bearer ${rawKey}` },
        session: null,
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
