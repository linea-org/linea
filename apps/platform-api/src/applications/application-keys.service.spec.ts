import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { db, pool, schema } from '@linea/db'
import { hashApiKey } from '../auth/api-key.util'
import { ApplicationKeysService } from './application-keys.service'

afterAll(async () => {
  await pool.end()
})

describe('ApplicationKeysService', () => {
  it('returns raw credentials once and rotates without exposing stored hashes', async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Application Keys Test Org',
        slug: `application-keys-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [actor] = await db
      .insert(schema.users)
      .values({
        name: 'Application Keys Admin',
        email: `application-keys-${suffix}@example.com`,
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
    const service = new ApplicationKeysService()
    try {
      const created = await service.create(
        organization.id,
        application.id,
        actor.id,
        { name: 'Production backend', scopes: ['executions:start'] },
      )
      expect(created.rawKey.startsWith('lin_app_')).toBe(true)
      expect(created).not.toHaveProperty('hashedKey')
      const { rows } = await pool.query<{ hashed_key: string }>(
        'SELECT hashed_key FROM application_keys WHERE id = $1',
        [created.id],
      )
      expect(rows[0]?.hashed_key).toBe(hashApiKey(created.rawKey))
      const listed = await service.list(organization.id, application.id)
      expect(listed[0]).not.toHaveProperty('rawKey')
      expect(listed[0]).not.toHaveProperty('hashedKey')
      const replacement = await service.rotate(
        organization.id,
        application.id,
        created.id,
        actor.id,
      )
      expect(replacement.rawKey).not.toBe(created.rawKey)
      expect(replacement.scopes).toEqual(created.scopes)
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM users WHERE id = $1', [actor.id])
    }
  })
})
