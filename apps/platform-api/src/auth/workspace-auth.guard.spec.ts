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

describe('WorkspaceAuthGuard', () => {
  const guard = new WorkspaceAuthGuard()

  it('resolves the workspace from an active session, without touching the Authorization header', async () => {
    const request = {
      headers: {},
      session: { session: { activeOrganizationId: 'org-from-session' } },
    } as Partial<AuthenticatedRequest>

    const allowed = await guard.canActivate(contextWithRequest(request))
    expect(allowed).toBe(true)
    expect(request.workspaceId).toBe('org-from-session')
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
