import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { HttpException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { db, pool, repositories, schema } from '@linea/db'
import { generateApiKey, generateApplicationKey } from './api-key.util'
import {
  ApplicationKeyGuard,
  type ApplicationAuthenticatedRequest,
  type ApplicationPrincipal,
} from './application-key.guard'
import { ApplicationScopeGuard } from './application-scope.guard'
import { APPLICATION_SCOPES_KEY } from './require-application-scopes.decorator'
import {
  WorkspaceAuthGuard,
  type AuthenticatedRequest,
} from './workspace-auth.guard'

afterAll(async () => {
  await pool.end()
})

function contextWithRequest(
  request:
    | Partial<ApplicationAuthenticatedRequest>
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
      name: 'Application Guard Test Org',
      slug: `application-guard-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const [actor] = await db
    .insert(schema.users)
    .values({
      name: 'Application Guard Admin',
      email: `application-guard-${suffix}@example.com`,
    })
    .returning()
  const [application] = await db
    .insert(schema.applications)
    .values({
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
    .returning()
  return { organization, actor, application }
}

async function removeFixture(workspaceId: string, actorUserId: string) {
  await pool.query('DELETE FROM organizations WHERE id = $1', [workspaceId])
  await pool.query('DELETE FROM users WHERE id = $1', [actorUserId])
}

describe('Application key authorization', () => {
  it('authenticates one Application principal and audits use', async () => {
    const { organization, actor, application } = await createFixture()
    try {
      const generated = generateApplicationKey()
      const created = await repositories.applicationKey.createApplicationKey(
        db,
        {
          workspaceId: organization.id,
          applicationId: application.id,
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
      } as Partial<ApplicationAuthenticatedRequest>
      await expect(
        new ApplicationKeyGuard().canActivate(
          contextWithRequest(request, () => undefined),
        ),
      ).resolves.toBe(true)
      expect(request.applicationPrincipal).toMatchObject({
        workspaceId: organization.id,
        applicationId: application.id,
        scopes: ['executions:start'],
      })
      const { rows } = await pool.query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE action = 'application_key.used' AND resource_id = $1",
        [request.applicationPrincipal?.keyId],
      )
      expect(rows).toHaveLength(1)
    } finally {
      await removeFixture(organization.id, actor.id)
    }
  })

  it('returns the same stable failure for absent, revoked, and workspace keys', async () => {
    const { organization, actor, application } = await createFixture()
    try {
      const applicationCredential = generateApplicationKey()
      const created = await repositories.applicationKey.createApplicationKey(
        db,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          name: 'Revoked backend',
          scopes: ['executions:read'],
          hashedKey: applicationCredential.hashedKey,
          keyPrefix: applicationCredential.keyPrefix,
        },
        { userId: actor.id },
      )
      if (created.outcome !== 'created') throw new Error('Key creation failed')
      await repositories.applicationKey.revokeApplicationKey(
        db,
        organization.id,
        application.id,
        created.applicationKey.id,
        { userId: actor.id },
      )
      const workspaceCredential = generateApiKey()
      await repositories.apiKey.createApiKey(db, {
        workspaceId: organization.id,
        name: 'Workspace key',
        hashedKey: workspaceCredential.hashedKey,
        keyPrefix: workspaceCredential.keyPrefix,
      })
      const guard = new ApplicationKeyGuard()
      const requests = [
        { headers: {} },
        {
          headers: {
            authorization: `Bearer ${applicationCredential.rawKey}`,
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
            message: 'Application authentication failed',
          },
        },
        {
          error: {
            code: 'authentication_failed',
            message: 'Application authentication failed',
          },
        },
        {
          error: {
            code: 'authentication_failed',
            message: 'Application authentication failed',
          },
        },
      ])
      await expect(
        new WorkspaceAuthGuard().canActivate(
          contextWithRequest(
            {
              headers: {
                authorization: `Bearer ${applicationCredential.rawKey}`,
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

  it('denies and audits missing scopes and cross-Application access', async () => {
    const { organization, actor, application } = await createFixture()
    const [otherApplication] = await db
      .insert(schema.applications)
      .values({
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
      .returning()
    try {
      const credential = generateApplicationKey()
      const created = await repositories.applicationKey.createApplicationKey(
        db,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          name: 'Read-only backend',
          scopes: ['executions:read'],
          hashedKey: credential.hashedKey,
          keyPrefix: credential.keyPrefix,
        },
        { userId: actor.id },
      )
      if (created.outcome !== 'created') throw new Error('Key creation failed')
      const principal: ApplicationPrincipal = {
        keyId: created.applicationKey.id,
        workspaceId: organization.id,
        applicationId: application.id,
        scopes: created.applicationKey.scopes,
      }
      const handler = () => undefined
      Reflect.defineMetadata(
        APPLICATION_SCOPES_KEY,
        ['executions:start'],
        handler,
      )
      const guard = new ApplicationScopeGuard(new Reflector())
      const scopeFailure = await caughtException(() =>
        guard.canActivate(
          contextWithRequest(
            {
              headers: {},
              params: { applicationId: application.id },
              applicationPrincipal: principal,
            },
            handler,
          ),
        ),
      )
      expect(scopeFailure.getResponse()).toEqual({
        error: {
          code: 'scope_denied',
          message: 'Application key scope denied',
        },
      })
      const applicationFailure = await caughtException(() =>
        guard.canActivate(
          contextWithRequest(
            {
              headers: {},
              params: { applicationId: otherApplication.id },
              applicationPrincipal: principal,
            },
            handler,
          ),
        ),
      )
      expect(applicationFailure.getResponse()).toEqual({
        error: { code: 'resource_not_found', message: 'Resource not found' },
      })
      const { rows } = await pool.query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE resource_id = $1 AND action IN ('application_key.scope_denied', 'application_key.cross_application_access_denied') ORDER BY created_at",
        [created.applicationKey.id],
      )
      expect(rows.map((row) => row.action).sort()).toEqual([
        'application_key.cross_application_access_denied',
        'application_key.scope_denied',
      ])
    } finally {
      await removeFixture(organization.id, actor.id)
    }
  })
})
