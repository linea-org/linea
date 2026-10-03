import { configureTestEnvironment } from '@linea/db/testing'
import { getTestApplicationId } from '@linea/db/testing'
import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { HttpException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { db, pool, repositories, schema } from '@linea/db'
import { generateApiKey, generateEnvironmentKey } from './api-key.util'
import {
  EnvironmentKeyGuard,
  type EnvironmentAuthenticatedRequest,
  type EnvironmentPrincipal,
} from './environment-key.guard'
import { EnvironmentScopeGuard } from './environment-scope.guard'
import { ENVIRONMENT_SCOPES_KEY } from './require-environment-scopes.decorator'
import {
  WorkspaceAuthGuard,
  type AuthenticatedRequest,
} from './workspace-auth.guard'

afterAll(async () => {
  await pool.end()
})

function contextWithRequest(
  request:
    | Partial<EnvironmentAuthenticatedRequest>
    | Partial<AuthenticatedRequest>,
  handler: () => void,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext
}

async function caughtException(operation: () => Promise<boolean>) {
  try {
    await operation()
  } catch (error) {
    if (error instanceof HttpException) return error
    throw error
  }
  throw new Error('Expected an HTTP exception')
}

async function createFixture() {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: 'Environment Guard Test Org',
      slug: `environment-guard-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const [actor] = await db
    .insert(schema.users)
    .values({
      name: 'Environment Guard Admin',
      email: `environment-guard-${suffix}@example.com`,
    })
    .returning()
  const environment = await configureTestEnvironment(db, {
    applicationId: await getTestApplicationId(db, organization.id),
    workspaceId: organization.id,
    environment: 'production',
    displayName: 'Customer portal',
    allowedBrowserOrigins: ['https://app.example.com'],
    allowedRedirectOrigins: ['https://app.example.com'],
    oidcIssuer: 'https://identity.example.com',
    oidcClientId: 'customer-portal',
    oidcAudience: 'linea',
    oidcJwksUrl: 'https://identity.example.com/jwks.json',
  })
  return { organization, actor, environment }
}

async function removeFixture(workspaceId: string, actorUserId: string) {
  await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
  await pool.query('DELETE FROM users WHERE id = $1', [actorUserId])
}

describe('Environment key authorization', () => {
  it('authenticates one Environment principal and audits use', async () => {
    const { organization, actor, environment } = await createFixture()
    try {
      const generated = generateEnvironmentKey()
      const created = await repositories.environmentKey.createEnvironmentKey(
        db,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: 'Production backend',
          scopes: ['executions:start'],
          hashedKey: generated.hashedKey,
          keyPrefix: generated.keyPrefix,
        },
        { userId: actor.id },
      )
      expect(created.outcome).toBe('created')
      const request = {
        headers: { authorization: `Bearer ${generated.rawKey}` },
      } as Partial<EnvironmentAuthenticatedRequest>
      await expect(
        new EnvironmentKeyGuard().canActivate(
          contextWithRequest(request, () => undefined),
        ),
      ).resolves.toBe(true)
      expect(request.environmentPrincipal).toMatchObject({
        workspaceId: organization.id,
        environmentId: environment.id,
        scopes: ['executions:start'],
      })
      const { rows } = await pool.query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE action = 'environment_key.used' AND resource_id = $1",
        [request.environmentPrincipal?.keyId],
      )
      expect(rows).toHaveLength(1)
    } finally {
      await removeFixture(organization.id, actor.id)
    }
  })
  it('returns the same stable failure for absent, revoked, and workspace keys', async () => {
    const { organization, actor, environment } = await createFixture()
    try {
      const environmentCredential = generateEnvironmentKey()
      const created = await repositories.environmentKey.createEnvironmentKey(
        db,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: 'Revoked backend',
          scopes: ['executions:read'],
          hashedKey: environmentCredential.hashedKey,
          keyPrefix: environmentCredential.keyPrefix,
        },
        { userId: actor.id },
      )
      if (created.outcome !== 'created') throw new Error('Key creation failed')
      await repositories.environmentKey.revokeEnvironmentKey(
        db,
        organization.id,
        environment.id,
        created.environmentKey.id,
        { userId: actor.id },
      )
      const workspaceCredential = generateApiKey()
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Workspace key',
        hashedKey: workspaceCredential.hashedKey,
        keyPrefix: workspaceCredential.keyPrefix,
      })
      const guard = new EnvironmentKeyGuard()
      const requests = [
        { headers: {} },
        {
          headers: {
            authorization: `Bearer ${environmentCredential.rawKey}`,
          },
        },
        {
          headers: { authorization: `Bearer ${workspaceCredential.rawKey}` },
        },
      ]
      const failures = await Promise.all(
        requests.map((request) =>
          caughtException(() =>
            guard.canActivate(contextWithRequest(request, () => undefined)),
          ),
        ),
      )
      expect(failures.map((failure) => failure.getStatus())).toEqual([
        401, 401, 401,
      ])
      expect(failures.map((failure) => failure.getResponse())).toEqual([
        {
          error: {
            code: 'authentication_failed',
            message: 'Environment authentication failed',
          },
        },
        {
          error: {
            code: 'authentication_failed',
            message: 'Environment authentication failed',
          },
        },
        {
          error: {
            code: 'authentication_failed',
            message: 'Environment authentication failed',
          },
        },
      ])
      await expect(
        new WorkspaceAuthGuard().canActivate(
          contextWithRequest(
            {
              headers: {
                authorization: `Bearer ${environmentCredential.rawKey}`,
              },
              session: null,
            },
            () => undefined,
          ),
        ),
      ).rejects.toThrow()
    } finally {
      await removeFixture(organization.id, actor.id)
    }
  })
  it('denies and audits missing scopes and cross-Environment access', async () => {
    const { organization, actor, environment } = await createFixture()
    const otherEnvironment = await configureTestEnvironment(db, {
      applicationId: (
        await repositories.application.createApplication(db, {
          workspaceId: organization.id,
          name: 'Other product',
          slug: crypto.randomUUID(),
        })
      ).id,
      workspaceId: organization.id,
      environment: 'production',
      displayName: 'Other portal',
      allowedBrowserOrigins: ['https://other.example.com'],
      allowedRedirectOrigins: ['https://other.example.com'],
      oidcIssuer: 'https://identity.example.com',
      oidcClientId: 'other-portal',
      oidcAudience: 'linea',
      oidcJwksUrl: 'https://identity.example.com/jwks.json',
    })
    try {
      const credential = generateEnvironmentKey()
      const created = await repositories.environmentKey.createEnvironmentKey(
        db,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          name: 'Read-only backend',
          scopes: ['executions:read'],
          hashedKey: credential.hashedKey,
          keyPrefix: credential.keyPrefix,
        },
        { userId: actor.id },
      )
      if (created.outcome !== 'created') throw new Error('Key creation failed')
      const principal: EnvironmentPrincipal = {
        keyId: created.environmentKey.id,
        workspaceId: organization.id,
        environmentId: environment.id,
        scopes: created.environmentKey.scopes,
      }
      const handler = () => undefined
      Reflect.defineMetadata(
        ENVIRONMENT_SCOPES_KEY,
        ['executions:start'],
        handler,
      )
      const guard = new EnvironmentScopeGuard(new Reflector())
      const scopeFailure = await caughtException(() =>
        guard.canActivate(
          contextWithRequest(
            {
              headers: {},
              params: { environmentId: environment.id },
              environmentPrincipal: principal,
            },
            handler,
          ),
        ),
      )
      expect(scopeFailure.getResponse()).toEqual({
        error: {
          code: 'scope_denied',
          message: 'Environment key scope denied',
        },
      })
      const environmentFailure = await caughtException(() =>
        guard.canActivate(
          contextWithRequest(
            {
              headers: {},
              params: { environmentId: otherEnvironment.id },
              environmentPrincipal: principal,
            },
            handler,
          ),
        ),
      )
      expect(environmentFailure.getResponse()).toEqual({
        error: { code: 'resource_not_found', message: 'Resource not found' },
      })
      const { rows } = await pool.query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE resource_id = $1 AND action IN ('environment_key.scope_denied', 'environment_key.cross_environment_access_denied') ORDER BY created_at",
        [created.environmentKey.id],
      )
      expect(rows.map((row) => row.action).sort()).toEqual([
        'environment_key.cross_environment_access_denied',
        'environment_key.scope_denied',
      ])
    } finally {
      await removeFixture(organization.id, actor.id)
    }
  })
})
